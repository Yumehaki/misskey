<template>
<div class="mk-note-detail" :title="title" tabindex="-1">
	<button
		class="read-more"
		v-if="appearNote.reply && appearNote.reply.replyId && conversation.length == 0"
		:title="$t('title')"
		@click="fetchConversation"
		:disabled="conversationFetching"
	>
		<template v-if="!conversationFetching"><fa icon="ellipsis-v"/></template>
		<template v-if="conversationFetching"><fa icon="spinner" pulse/></template>
	</button>
	<mk-renote class="renote" v-if="isRenote" :note="note"/>
	<div class="conversation">
		<x-sub v-for="note in conversation" :key="note.id" :note="note"/>
	</div>
	<div class="reply-to" v-if="appearNote.reply">
		<x-sub :note="appearNote.reply"/>
	</div>
	<article>
		<mk-avatar class="avatar" :user="appearNote.user"/>
		<header>
			<router-link class="name" :to="appearNote.user | userPage" v-user-preview="appearNote.user.id">
				<mk-user-name :user="appearNote.user"/>
			</router-link>
			<span class="username"><mk-acct :user="appearNote.user"/></span>
			<x-instance-info v-if="appearNote.user.instance && $store.state.device.showInstanceInfo" :instance="appearNote.user.instance" />
		</header>
		<div class="body">
			<p v-if="appearNote.cw != null" class="cw">
				<mfm v-if="appearNote.cw != ''" class="text" :text="appearNote.cw" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis" :hashtags="appearNote.tags" :basic="!!appearNote.notHaveDecorationMfm" />
				<mk-cw-button v-model="showContent" :note="appearNote"/>
			</p>
			<div class="content" v-show="appearNote.cw == null || showContent">
				<div class="text">
					<span v-if="appearNote.isHidden" style="opacity: 0.5">{{ $t('private') }}</span>
					<span v-if="appearNote.deletedAt" style="opacity: 0.5">{{ $t('deleted') }}</span>
					<mfm v-if="appearNote.text" :text="appearNote.text" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis" :hashtags="appearNote.tags" :basic="!!appearNote.notHaveDecorationMfm" />
				</div>
				<div class="files" v-if="appearNote.files.length > 0">
					<mk-media-list :media-list="appearNote.files" :hide="!$store.state.device.alwaysShowNsfw && appearNote.cw == null"/>
				</div>
				<mk-poll v-if="appearNote.poll" :note="appearNote"/>
				<mk-url-preview v-for="url in urls" :url="url" :key="url" :detail="true"/>
				<a class="location" v-if="appearNote.geo" :href="`https://maps.google.com/maps?q=${appearNote.geo.coordinates[1]},${appearNote.geo.coordinates[0]}`" rel="noopener" target="_blank"><fa icon="map-marker-alt"/> {{ $t('location') }}</a>
				<div class="map" v-if="appearNote.geo" ref="map"></div>
				<div class="renote" v-if="appearNote.renote">
					<mk-note-preview :note="appearNote.renote"/>
				</div>
			</div>
		</div>
		<footer>
			<router-link class="time" :to="appearNote | notePage">
				<fa :icon="faClock"/>
				{{ }}
				<mk-time :time="appearNote.createdAt" mode="detail"/>
			</router-link>
			<div class="visibility-info">
				<x-visibility-icon class="visibility" :v="appearNote.visibility" :localOnly="appearNote.localOnly" :copyOnce="appearNote.copyOnce" :withText="true"/>
			</div>
			<span class="app" v-if="note.app && $store.state.settings.showVia">via <b>{{ note.app.name }}</b></span>
			<mk-reactions-viewer :note="appearNote"/>
			<button class="replyButton" @click="reply()" :title="$t('reply')">
				<fa :icon="appearNote.reply ? 'reply-all' : 'reply'"/>
				<p class="count" v-if="appearNote.repliesCount + appearNote.quoteCount > 0">{{ appearNote.repliesCount + appearNote.quoteCount }}</p>
			</button>
			<button v-if="appearNote.myRenoteId != null" class="renoteButton renoted" @click="undoRenote()" title="Undo">
				<fa icon="retweet"/><p class="count" v-if="appearNote.renoteCount - appearNote.quoteCount > 0">{{ appearNote.renoteCount - appearNote.quoteCount }}</p>
			</button>
			<button v-else-if="['public', 'home'].includes(appearNote.visibility)" class="renoteButton" @click="renote()" :title="$t('renote')">
				<fa icon="retweet"/><p class="count" v-if="appearNote.renoteCount - appearNote.quoteCount > 0">{{ appearNote.renoteCount - appearNote.quoteCount }}</p>
			</button>
			<button v-else class="inhibitedButton">
				<fa icon="ban"/>
			</button>
			<button v-if="appearNote.myReaction == null" class="reactionButton" @click="react()" ref="reactButton" :title="$t('add-reaction')">
				<fa-layers>
					<fa :icon="faLaugh"/>
					<fa icon="plus" transform="shrink-8 down-4 right-5" style="color: var(--noteActionsReactionHover)"/>
				</fa-layers>
			</button>
			<button v-if="appearNote.myReaction != null" class="reactionButton reacted" @click="undoReact(appearNote)" ref="reactButton" :title="$t('undo-reaction')">
				<fa :icon="faLaugh"/>
			</button>
			<button @click="menu()" ref="menuButton">
				<fa icon="ellipsis-h"/>
			</button>
		</footer>
	</article>
	<div class="replies" v-if="!compact">
		<x-sub v-for="note in replies" :key="note.id" :note="note"/>
	</div>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';
import XSub from './note.sub.vue';
import noteSubscriber from '../../../common/scripts/note-subscriber';
import noteMixin from '../../../common/scripts/note-mixin';
import { faClock, faLaugh } from '@fortawesome/free-regular-svg-icons';
import XVisibilityIcon from '../../../common/views/components/visibility-icon.vue';
import XInstanceInfo from '../../../common/views/components/instance-info.vue';

export default Vue.extend({
	i18n: i18n('desktop/views/components/note-detail.vue'),

	components: {
		XVisibilityIcon,
		XSub,
		XInstanceInfo,
	},

	mixins: [noteMixin(), noteSubscriber('note')],

	props: {
		note: {
			type: Object,
			required: true
		},
		compact: {
			default: false
		}
	},

	data() {
		return {
			faClock, faLaugh,
			conversation: [],
			conversationFetching: false,
			replies: []
		};
	},

	mounted() {
		// Get replies
		if (!this.compact) {
			this.$root.api('notes/children', {
				noteId: this.appearNote.id,
				limit: 30
			}).then(replies => {
				this.replies = replies;
			});
		}
	},

	methods: {
		fetchConversation() {
			this.conversationFetching = true;

			// Fetch conversation
			this.$root.api('notes/conversation', {
				noteId: this.appearNote.replyId
			}).then(conversation => {
				this.conversationFetching = false;
				this.conversation = conversation.reverse();
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.mk-note-detail
	overflow hidden
	text-align left
	background var(--face)
	border-radius 6px
	box-shadow 0 3px 8px rgba(0, 0, 0, 0.2)

	> .read-more
		display block
		margin 0
		padding 10px 0
		width 100%
		font-size 1em
		text-align center
		color #999
		cursor pointer
		background var(--subNoteBg)
		outline none
		border none
		border-bottom solid 1px var(--faceDivider)
		border-radius 6px 6px 0 0

		&:hover
			box-shadow 0 0 0 100px inset rgba(0, 0, 0, 0.05)

		&:active
			box-shadow 0 0 0 100px inset rgba(0, 0, 0, 0.1)

		&:disabled
			cursor wait

	> .conversation
		> *
			border-bottom 1px solid var(--faceDivider)

	> .renote + article
		padding-top 8px

	> .reply-to
		border-bottom 1px solid var(--faceDivider)

	> article
		padding 28px 32px 18px 32px

		&:after
			content ""
			display block
			clear both

		&:hover
			> footer > button
				color var(--noteActionsHighlighted)

		> .avatar
			width 60px
			height 60px
			border-radius 8px

		> header
			position absolute
			top 28px
			left 108px
			width calc(100% - 108px)

			> .name
				display inline-block
				margin 0
				line-height 24px
				color var(--noteHeaderName)
				font-size 18px
				font-weight 700
				text-align left
				text-decoration none

				&:hover
					text-decoration underline

			> .username
				display block
				text-align left
				margin 0
				color var(--noteHeaderAcct)

			> .info
				position absolute
				top 0
				right 32px
				font-size 1em

				> .time
					color var(--noteHeaderInfo)

				> .visibility-info
					text-align: right
					color var(--noteHeaderInfo)
					display inline-block

					> .visibility
						margin-left 8px
						display inline-block

					> .remote
						margin-left 4px
						color #4dabf7

		> .body
			padding 8px 0

			> .cw
				cursor default
				display block
				margin 0
				padding 0
				overflow-wrap break-word
				color var(--noteText)

				> .text
					margin-right 8px

			> .content
				> .text
					cursor default
					display block
					margin 0
					padding 0
					overflow-wrap break-word
					font-size 1.5em
					color var(--noteText)

				> .renote
					margin 0.3em 0.6em
					opacity 0.9

					> *
						padding 0.7em
						border-left 3px solid var(--mfmQuoteLine)

				> .location
					margin 4px 0
					font-size 12px
					color #ccc

				> .map
					width 100%
					height 300px

					&:empty
						display none

				> .mk-url-preview
					margin-top 8px

		> footer
			font-size 1.2em

			> .time, .visibility-info, .app
				display block
				font-size 0.8em
				color var(--noteHeaderInfo)

			> button
				margin 0 28px 0 0
				padding 8px
				background transparent
				border none
				font-size 1em
				color var(--noteActions)
				cursor pointer

				&:hover
					color var(--noteActionsHover)

				&.replyButton:hover
					color var(--noteActionsReplyHover)

				&.renoteButton:hover
					color var(--noteActionsRenoteHover)

				&.renoteButton.renoted
					color var(--primary)

				&.reactionButton:hover
					color var(--noteActionsHover)

				&.inhibitedButton
					cursor not-allowed

				> .count
					display inline
					margin 0 0 0 8px
					color var(--text)
					opacity 0.7
					font-size 0.8em

				&.reacted, &.reacted:hover
					color var(--noteActionsReactionHover)

	> .replies
		> *
			border-top 1px solid var(--faceDivider)

</style>
