<template>
<div>
	<mk-notes ref="timeline" :make-promise="makePromise" :timeSplitters="[3, 6, 12, 18, 19, 20, 21, 22, 23]" @inited="() => $emit('loaded')">
		<template #header>
			<slot></slot>
			<div v-if="src == 'home' && alone" class="ibpylqas">
				<p>{{ $t('@.empty-timeline-info.follow-users-to-make-your-timeline') }}</p>
				<router-link to="/explore">{{ $t('@.empty-timeline-info.explore') }}</router-link>
			</div>
		</template>
	</mk-notes>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';

const fetchLimit = 10;

export default Vue.extend({
	i18n: i18n('desktop/views/components/timeline.core.vue'),

	props: {
		src: {
			type: String,
			required: true
		},
		tagTl: {
			required: false
		}
	},

	data() {
		return {
			connection: null,
			date: null,
			baseQuery: {
				includeMyRenotes: this.$store.state.settings.showMyRenotes,
				includeRenotedMyNotes: this.$store.state.settings.showRenotedMyNotes,
				includeLocalRenotes: this.$store.state.settings.showLocalRenotes,
				excludeForeignReply: this.$store.state.settings.excludeForeignReply,
			},
			query: {},
			endpoint: null,
			makePromise: null
		};
	},

	computed: {
		alone(): boolean {
			return this.$store.state.i.followingCount == 0;
		}
	},

	created() {
		const prepend = note => {
			(this.$refs.timeline as any).prepend(note);
		};

		if (this.src == 'tag') {
			this.endpoint = 'notes/search_by_tag';
			this.query = {
				query: this.tagTl.query
			};
			this.connection = this.$root.stream.connectToChannel('hashtag', { q: this.tagTl.query });
			this.connection.on('note', prepend);
		} else if (this.src == 'home') {
			this.endpoint = 'notes/timeline';
			const onChangeFollowing = () => {
				this.fetch();
			};
			this.connection = this.$root.stream.connectToChannel('homeTimeline', { excludeForeignReply: this.$store.state.settings.excludeForeignReply });
			this.connection.on('note', prepend);
			this.connection.on('follow', onChangeFollowing);
			this.connection.on('unfollow', onChangeFollowing);
		} else if (this.src == 'local') {
			this.endpoint = 'notes/local-timeline';
			this.connection = this.$root.stream.useSharedConnection('localTimeline');
			this.connection.on('note', prepend);
		} else if (this.src == 'locao') {
			this.endpoint = 'notes/locao-timeline';
			this.connection = this.$root.stream.useSharedConnection('locaoTimeline');
			this.connection.on('note', prepend);
		} else if (this.src == 'hybrid') {
			this.endpoint = 'notes/hybrid-timeline';
			this.connection = this.$root.stream.connectToChannel('hybridTimeline', { excludeForeignReply: this.$store.state.settings.excludeForeignReply });
			this.connection.on('note', prepend);
		} else if (this.src == 'hot') {
			this.endpoint = 'notes/hot-timeline';
			this.connection = this.$root.stream.useSharedConnection('hotTimeline');
			this.connection.on('note', prepend);
		} else if (this.src == 'global') {
			this.endpoint = 'notes/global-timeline';
			this.connection = this.$root.stream.useSharedConnection('globalTimeline');
			this.connection.on('note', prepend);
		} else if (this.src == 'mentions') {
			this.endpoint = 'notes/mentions';
			this.connection = this.$root.stream.useSharedConnection('main');
			this.connection.on('mention', prepend);
		} else if (this.src == 'messages') {
			this.endpoint = 'notes/mentions';
			this.query = {
				visibility: 'specified'
			};
			const onNote = note => {
				if (note.visibility == 'specified') {
					prepend(note);
				}
			};
			this.connection = this.$root.stream.useSharedConnection('main');
			this.connection.on('mention', onNote);
		}

		this.makePromise = cursor => this.$root.api(this.endpoint, {
			limit: fetchLimit + 1,
			untilId: cursor ? cursor : undefined,
			...this.baseQuery, ...this.query
		}).then(notes => {
			if (notes.length == fetchLimit + 1) {
				notes.pop();
				return {
					notes: notes,
					cursor: notes[notes.length - 1].id
				};
			} else {
				return {
					notes: notes,
					cursor: null
				};
			}
		});
	},

	beforeDestroy() {
		this.connection.dispose();
	},

	methods: {
		focus() {
			(this.$refs.timeline as any).focus();
		}
	}
});
</script>

<style lang="stylus" scoped>
.ibpylqas
	padding 16px
	text-align center
	color var(--text)
	border-bottom solid var(--lineWidth) var(--faceDivider)
	font-size 14px

	> p
		margin 0 0 8px 0

</style>
