import $ from 'cafy';
import define from '../../../define';
import { deliverQueue, inboxQueue, dbQueue } from '../../../../../queue/queues';
import * as Bull from 'bull';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,

	params: {
		domain: {
			validator: $.str,
		},

		state: {
			validator: $.str.or(['waiting', 'active', 'completed', 'failed', 'delayed'])
		},

		limit: {
			validator: $.optional.num,
			default: 50
		},
	}
};

export default define(meta, async (ps) => {
	const queue =
		ps.domain === 'deliver' ? deliverQueue :
		ps.domain === 'inbox' ? inboxQueue :
		ps.domain === 'db' ? dbQueue :
		null;

	if (queue == null) throw(`invalid domain`);

	const jobs = await (queue as Bull.Queue<any>).getJobs([ps.state as any], 0, ps.limit);

	return jobs.map(job => {
		const data = job.data;
		delete data.content;
		delete data.user;
		return {
			id: job.id,
			data,
			attempts: job.attemptsMade,
			maxAttempts: job.opts ? job.opts.attempts : 0,
			timestamp: job.timestamp,

			name: job.name,
			delay: job.opts.delay
		};
	});
});
