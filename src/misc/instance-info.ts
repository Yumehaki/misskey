import Instance from '../models/instance';
import { toApHost } from './convert-host';

let blockedHosts: Set<string>;
let closedHosts: Set<string>;

export async function isBlockedHost(host: string | null) {
	if (host == null) return false;
	if (!blockedHosts) await Update();
	return blockedHosts?.has(toApHost(host));
}

export async function isClosedHost(host: string | null) {
	if (host == null) return false;
	if (!closedHosts) await Update();
	return closedHosts?.has(toApHost(host));
}

async function Update() {
	const blocked = await Instance.find({
		isBlocked: true
	});
	blockedHosts = new Set(blocked.map(x => toApHost(x.host)));

	const closed = await Instance.find({
		isMarkedAsClosed: true
	});
	closedHosts = new Set(closed.map(x => toApHost(x.host)));
}

Update();

setInterval(() => {
	Update();
}, 300 * 1000);
