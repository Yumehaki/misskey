import * as getCaretCoordinates from 'textarea-caret';
import { toASCII } from 'punycode/';

export default {
	bind(el, binding, vn) {
		const self = el._autoCompleteDirective_ = {} as any;
		self.x = new Autocomplete(el, vn.context, binding.value);
		self.x.attach();
	},

	unbind(el, binding, vn) {
		const self = el._autoCompleteDirective_;
		self.x.detach();
	}
};

/**
 * オートコンプリートを管理するクラス。
 */
class Autocomplete {
	private suggestion: any;
	private textarea: any;
	private vm: any;
	private currentType: string;
	private opts: {
		model: string;
		noZwsp?: boolean;
		userOnly?: boolean;
		localOnly?: boolean;
		noEmoji?: boolean;
	};
	private opening: boolean;

	private get text(): string {
		return this.vm[this.opts.model];
	}

	private set text(text: string) {
		this.vm[this.opts.model] = text;
	}

	/**
	 * 対象のテキストエリアを与えてインスタンスを初期化します。
	 */
	constructor(textarea, vm, opts) {
		//#region BIND
		this.onInput = this.onInput.bind(this);
		this.complete = this.complete.bind(this);
		this.close = this.close.bind(this);
		//#endregion

		this.suggestion = null;
		this.textarea = textarea;
		this.vm = vm;
		this.opts = opts;
		this.opening = false;
	}

	/**
	 * このインスタンスにあるテキストエリアの入力のキャプチャを開始します。
	 */
	public attach() {
		this.textarea.addEventListener('input', this.onInput);
	}

	/**
	 * このインスタンスにあるテキストエリアの入力のキャプチャを解除します。
	 */
	public detach() {
		this.textarea.removeEventListener('input', this.onInput);
		this.close();
	}

	/**
	 * テキスト入力時
	 */
	private onInput() {
		const caretPos = this.textarea.selectionStart;
		const text = this.text.substr(0, caretPos).split('\n').pop();

		const mentionIndex = text.lastIndexOf('@');
		const hashtagIndex = text.lastIndexOf('#');
		const emojiIndex = text.lastIndexOf(':');
		const angleIndex = text.lastIndexOf('<');
		const fnIndex = text.lastIndexOf('[');
		const groupIndex = text.lastIndexOf('$');

		const max = Math.max(
			mentionIndex,
			hashtagIndex,
			emojiIndex,
			angleIndex,
			fnIndex,
			groupIndex,
		);

		if (max == -1) {
			this.close();
			return;
		}

		const isMention = mentionIndex != -1;
		const isHashtag = hashtagIndex != -1;
		const isEmoji = emojiIndex != -1;
		const isAngle = angleIndex != -1;
		const isFn = fnIndex != -1;
		const isGroup = groupIndex != -1;

		let opened = false;

		if (isMention) {
			const username = text.substr(mentionIndex + 1);
			if (username.match(/^[\w-]+$/)) {
				this.open('user', username);
				opened = true;
			}
		}

		if (isHashtag && opened == false && !this.opts.userOnly) {
			const hashtag = text.substr(hashtagIndex + 1);
			if (!hashtag.includes(' ')) {
				this.open('hashtag', hashtag);
				opened = true;
			}
		}

		if (isEmoji && opened == false && !this.opts.userOnly && !this.opts.noEmoji) {
			const emoji = text.substr(emojiIndex + 1);
			if (emoji === '' || emoji.match(/^[\w+-]+$/)) {
				this.open('emoji', emoji);
				opened = true;
			}
		}

		if (isAngle && opened == false) {
			const angle = text.substr(angleIndex + 1);
			if (angle.match(/^[a-z]*$/)) {
				this.open('mfm', `<${angle}`);
				opened = true;
			}
		}

		if (isFn && opened == false) {
			const fn = text.substr(fnIndex + 1);
			if (fn.match(/^[a-z]*$/)) {
				this.open('mfm', `[${fn}`);
				opened = true;
			}
		}
		
		if (isGroup) {
			const groupname = text.substr(groupIndex + 1);
			if (groupname.match(/^[\w-]+$/)) {
				this.open('group', groupname);
				opened = true;
			}
		}

		if (!opened) {
			this.close();
		}
	}

	/**
	 * サジェストを提示します。
	 */
	private async open(type, q) {
		if (type != this.currentType) {
			this.close();
		}
		if (this.opening) return;
		this.opening = true;
		this.currentType = type;

		//#region サジェストを表示すべき位置を計算
		const caretPosition = getCaretCoordinates(this.textarea, this.textarea.selectionStart);

		const rect = this.textarea.getBoundingClientRect();

		const x = rect.left + caretPosition.left - this.textarea.scrollLeft;
		const y = rect.top + caretPosition.top - this.textarea.scrollTop;
		//#endregion

		if (this.suggestion) {
			this.suggestion.x = x;
			this.suggestion.y = y;
			this.suggestion.q = q;

			this.opening = false;
		} else {
			const MkAutocomplete = await import('../components/autocomplete.vue').then(m => m.default);

			// サジェスト要素作成
			this.suggestion = new MkAutocomplete({
				parent: this.vm,
				propsData: {
					textarea: this.textarea,
					complete: this.complete,
					close: this.close,
					type: type,
					q: q,
					localOnly: this.opts.localOnly,
					x,
					y
				}
			}).$mount();

			// 要素追加
			document.body.appendChild(this.suggestion.$el);

			this.opening = false;
		}
	}

	/**
	 * サジェストを閉じます。
	 */
	private close() {
		if (this.suggestion == null) return;

		this.suggestion.destroyDom();
		this.suggestion = null;

		this.textarea.focus();
	}

	/**
	 * オートコンプリートする
	 */
	private complete(type, value) {
		this.close();

		const caret = this.textarea.selectionStart;

		if (type == 'user') {
			const source = this.text;

			const before = source.substr(0, caret);
			const trimmedBefore = before.substring(0, before.lastIndexOf('@'));
			const after = source.substr(caret);

			const acct = value.host === null ? value.username : `${value.username}@${toASCII(value.host)}`;

			// 挿入
			this.text = `${trimmedBefore}@${acct} ${after}`;

			// キャレットを戻す
			this.vm.$nextTick(() => {
				this.textarea.focus();
				const pos = trimmedBefore.length + (acct.length + 2);
				this.textarea.setSelectionRange(pos, pos);
			});
		} else if (type == 'hashtag') {
			const source = this.text;

			const before = source.substr(0, caret);
			const trimmedBefore = before.substring(0, before.lastIndexOf('#'));
			const after = source.substr(caret);

			// 挿入
			this.text = `${trimmedBefore}#${value} ${after}`;

			// キャレットを戻す
			this.vm.$nextTick(() => {
				this.textarea.focus();
				const pos = trimmedBefore.length + (value.length + 2);
				this.textarea.setSelectionRange(pos, pos);
			});
		} else if (type == 'emoji') {
			const source = this.text;

			const before = source.substr(0, caret);
			const trimmedBefore = before.substring(0, before.lastIndexOf(':'));
			const after = source.substr(caret);

			// 挿入
			const sep = (value.startsWith(':') && !this.opts.noZwsp) ? String.fromCharCode(0x200B) : '';
			this.text = trimmedBefore + value + sep + after;

			// キャレットを戻す
			this.vm.$nextTick(() => {
				this.textarea.focus();
				const pos = trimmedBefore.length + (value.startsWith(':') ? value.length + 1 : value.length);
				this.textarea.setSelectionRange(pos, pos);
			});
		} else if (type == 'mfm') {
			const source = this.text;

			const before = source.substr(0, caret);
			const trimmedBefore = before.substring(0, before.lastIndexOf('<'));
			const after = source.substr(caret);

			// 挿入
			this.text = `${trimmedBefore}${value.head}${value.tail}${after}`;

			// キャレットを戻す
			this.vm.$nextTick(() => {
				this.textarea.focus();
				const pos = trimmedBefore.length + value.head.length;
				this.textarea.setSelectionRange(pos, pos);
			});
		}
	}
}
