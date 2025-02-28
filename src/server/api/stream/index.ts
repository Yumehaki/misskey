import autobind from 'autobind-decorator';
import * as websocket from 'websocket';

import User, { IUser } from '../../../models/user';
import readNotification from '../common/read-notification';
import call from '../call';
import { IApp } from '../../../models/app';
import readNote from '../../../services/note/read';

import Channel from './channel';
import channels from './channels';
import { EventEmitter } from 'events';
import { ApiError } from '../error';
import { getHideUserIdsById } from '../common/get-hide-users';
import { PubSubMessage, NoteStreamBody } from '../../../services/stream';

/**
 * Main stream connection
 */
export default class Connection {
	public user?: IUser | null;
	public app?: IApp | null;
	private wsConnection: websocket.connection;
	public subscriber: EventEmitter;
	private channels: Channel[] = [];
	private subscribingNotes: any = {};
	public sendMessageToWsOverride: any = null; // 後方互換性のため
	public muting: string[] = [];

	constructor(
		wsConnection: websocket.connection,
		subscriber: EventEmitter,
		user: IUser | null | undefined,
		app: IApp | null | undefined,
	) {
		this.wsConnection = wsConnection;
		this.user = user;
		this.app = app;
		this.subscriber = subscriber;

		this.wsConnection.on('message', this.onWsConnectionMessage);

		if (this.user) {
			this.updateMuting();
			this.subscriber.on(`serverEvent:${this.user._id}`, this.onServerEvent);
		}
	}

	/**
	 * クライアントからメッセージ受信時
	 */
	@autobind
	private async onWsConnectionMessage(data: websocket.IMessage) {
		if (data.utf8Data == null) return;
		if (data.utf8Data === 'ping') return;

		const { type, body } = JSON.parse(data.utf8Data);

		switch (type) {
			case 'api': this.onApiRequest(body); break;
			case 'readNotification': this.onReadNotification(body); break;
			case 'subNote': this.onSubscribeNote(body); break;
			case 'sn': this.onSubscribeNote(body); break; // alias
			case 'unsubNote': this.onUnsubscribeNote(body); break;
			case 'un': this.onUnsubscribeNote(body); break; // alias
			case 'connect': this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': this.onChannelMessageRequested(body); break;
			case 'ch': this.onChannelMessageRequested(body); break; // alias
		}
	}

	/**
	 * APIリクエスト要求時
	 */
	@autobind
	private async onApiRequest(payload: any) {
		// 新鮮なデータを利用するためにユーザーをフェッチ
		const user = this.user ? await User.findOne({ _id: this.user._id }) : null;

		const endpoint = payload.endpoint || payload.ep; // alias

		// 呼び出し
		call(endpoint, user, this.app, payload.data).then(res => {
			this.sendMessageToWs(`api:${payload.id}`, { res });
		}).catch((e: ApiError) => {
			this.sendMessageToWs(`api:${payload.id}`, {
				error: {
					message: e.message,
					code: e.code,
					id: e.id,
					kind: e.kind,
					...(e.info ? { info: e.info } : {})
				}
			});
		});
	}

	@autobind
	private onReadNotification(payload: any) {
		if (!payload.id) return;
		readNotification(this.user!._id, payload.id);
	}

	/**
	 * 投稿購読要求時
	 */
	@autobind
	private onSubscribeNote(payload: any) {
		if (!payload.id) return;

		if (this.subscribingNotes[payload.id] == null) {
			this.subscribingNotes[payload.id] = 0;
		}

		this.subscribingNotes[payload.id]++;

		if (this.subscribingNotes[payload.id] == 1) {
			this.subscriber.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}

		if (payload.read) {
			readNote(this.user!._id, payload.id);
		}
	}

	/**
	 * 投稿購読解除要求時
	 */
	@autobind
	private onUnsubscribeNote(payload: any) {
		if (!payload.id) return;

		this.subscribingNotes[payload.id]--;
		if (this.subscribingNotes[payload.id] <= 0) {
			delete this.subscribingNotes[payload.id];
			this.subscriber.off(`noteStream:${payload.id}`, this.onNoteStreamMessage);
		}
	}

	@autobind
	private async onNoteStreamMessage(data: PubSubMessage<NoteStreamBody>) {
		this.sendMessageToWs('noteUpdated', {
			id: data.body!.id,
			type: data.type,
			body: data.body!.body,
		});
	}

	/**
	 * チャンネル接続要求時
	 */
	@autobind
	private onChannelConnectRequested(payload: any) {
		const { channel, id, params, pong } = payload;
		this.connectChannel(id, params, channel, pong);
	}

	/**
	 * チャンネル切断要求時
	 */
	@autobind
	private onChannelDisconnectRequested(payload: any) {
		const { id } = payload;
		this.disconnectChannel(id);
	}

	/**
	 * クライアントにメッセージ送信
	 */
	@autobind
	public sendMessageToWs(type: string, payload: any) {
		if (this.sendMessageToWsOverride) return this.sendMessageToWsOverride(type, payload); // 後方互換性のため
		this.wsConnection.send(JSON.stringify({
			type: type,
			body: payload
		}));
	}

	/**
	 * チャンネルに接続
	 */
	@autobind
	public connectChannel(id: string, params: any, channel: string, pong = false) {
		if ((channels as any)[channel].requireCredential && this.user == null) {
			return;
		}

		const ch: Channel = new (channels as any)[channel](id, this);
		this.channels.push(ch);
		ch.init(params);

		if (pong) {
			this.sendMessageToWs('connected', {
				id: id
			});
		}
	}

	/**
	 * チャンネルから切断
	 * @param id チャンネルコネクションID
	 */
	@autobind
	public disconnectChannel(id: string) {
		const channel = this.channels.find(c => c.id === id);

		if (channel) {
			if (channel.dispose) channel.dispose();
			this.channels = this.channels.filter(c => c.id !== id);
		}
	}

	/**
	 * チャンネルへメッセージ送信要求時
	 * @param data メッセージ
	 */
	@autobind
	private onChannelMessageRequested(data: any) {
		const channel = this.channels.find(c => c.id === data.id);
		if (channel != null && channel.onMessage != null) {
			channel.onMessage(data.type, data.body);
		}
	}

	@autobind
	private async onServerEvent(data: PubSubMessage<unknown>) {
		if (data.type === 'mutingChanged') {
			this.updateMuting();
		}

		if (data.type === 'terminate') {
			this.wsConnection.close();
			this.dispose();
		}
	}

	@autobind
	private async updateMuting() {
		const hides = await getHideUserIdsById(this.user?._id, true, false);
		this.muting = hides.map(x => `${x}`);
	}

	/**
	 * ストリームが切れたとき
	 */
	@autobind
	public dispose() {
		for (const c of this.channels.filter(c => c.dispose)) {
			c.dispose();
		}
		this.subscriber.off(`serverEvent:${this.user!._id}`, this.onServerEvent);
	}
}
