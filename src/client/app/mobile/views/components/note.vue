<template>
<div
	class="note"
	v-show="appearNote.deletedAt == null && !hideThisNote"
	:tabindex="appearNote.deletedAt == null ? '-1' : null"
	:class="{
		renote: isRenote,
		smart: $store.state.device.postStyle == 'smart',
		mini: narrow,
	}"
	v-hotkey="keymap"
>
	<mk-renote class="renote" v-if="isRenote" :note="note"/>
	<x-sub v-for="note in conversation" :key="note.id" :note="note"/>
	<div
		class="reply-to"
		:class="{
			'visibility-home': appearNote.reply.visibility === 'home',
			'visibility-followers': appearNote.reply.visibility === 'followers',
			'visibility-specified': appearNote.reply.visibility === 'specified',
			'coloring-bg': $store.state.device.visibilityColoring === 'bg',
			'coloring-left': $store.state.device.visibilityColoring === 'left',
		}"
		v-if="appearNote.reply && (!$store.getters.isSignedIn || $store.state.settings.showReplyTarget)"
	>
		<x-sub :note="appearNote.reply"/>
	</div>
	<article
		class="article"
		:class="{
			'visibility-home': appearNote.visibility === 'home',
			'visibility-followers': appearNote.visibility === 'followers',
			'visibility-specified': appearNote.visibility === 'specified',
			'coloring-bg': $store.state.device.visibilityColoring === 'bg',
			'coloring-left': $store.state.device.visibilityColoring === 'left',
		}"
	>
		<mk-avatar class="avatar" :user="appearNote.user" v-if="$store.state.device.postStyle != 'smart'"/>
		<div class="main">
			<mk-note-header class="header" :note="appearNote" :mini="true"/>
			<x-instance-info v-if="appearNote.user.instance && $store.state.device.showInstanceInfo" :instance="appearNote.user.instance" />
			<div class="body" v-if="appearNote.deletedAt == null">
				<p v-if="appearNote.cw != null" class="cw">
				<mfm v-if="appearNote.cw != ''" class="text" :text="appearNote.cw" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis" :hashtags="appearNote.tags" :basic="!!appearNote.notHaveDecorationMfm"/>
					<mk-cw-button v-model="showContent" :note="appearNote"/>
				</p>
				<div class="content" v-show="appearNote.cw == null || showContent">
					<div class="text">
						<span v-if="appearNote.isHidden" style="opacity: 0.5">({{ $t('private') }})</span>
						<a class="reply" v-if="appearNote.reply"><fa icon="reply"/></a>
						<mfm v-if="appearNote.text" :text="appearNote.text" :author="appearNote.user" :i="$store.state.i" :custom-emojis="appearNote.emojis" :hashtags="appearNote.tags" :basic="!!appearNote.notHaveDecorationMfm"/>
					</div>
					<div class="files" v-if="appearNote.files.length > 0">
						<mk-media-list :media-list="appearNote.files" :hide="!$store.state.device.alwaysShowNsfw && appearNote.cw == null"/>
					</div>
					<mk-poll v-if="appearNote.poll" :note="appearNote" ref="pollViewer"/>
					<mk-url-preview v-for="url in urls" :url="url" :key="url" :compact="true"/>
					<a class="location" v-if="appearNote.geo" :href="`https://maps.google.com/maps?q=${appearNote.geo.coordinates[1]},${appearNote.geo.coordinates[0]}`" rel="noopener" target="_blank"><fa icon="map-marker-alt"/> {{ $t('location') }}</a>
					<div class="renote" v-if="appearNote.renote"><mk-note-preview :note="appearNote.renote"/></div>
				</div>
			</div>
			<footer v-if="appearNote.deletedAt == null && !preview" class="footer">
				<mk-reactions-viewer :note="appearNote" ref="reactionsViewer"/>
				<button @click="reply()" class="button">
					<fa :icon="appearNote.reply ? 'reply-all' : 'reply'"/>
					<p class="count" v-if="appearNote.repliesCount + appearNote.quoteCount > 0">{{ appearNote.repliesCount + appearNote.quoteCount }}</p>
				</button>
				<button v-if="appearNote.myRenoteId != null" @click="undoRenote()" title="Undo" class="button renoted">
					<fa icon="retweet"/><p class="count" v-if="appearNote.renoteCount - appearNote.quoteCount > 0">{{ appearNote.renoteCount - appearNote.quoteCount }}</p>

				</button>
				<button v-else-if="['public', 'home'].includes(appearNote.visibility)" @click="renote()" title="Renote" class="button">
					<fa icon="retweet"/><p class="count" v-if="appearNote.renoteCount - appearNote.quoteCount > 0">{{ appearNote.renoteCount - appearNote.quoteCount }}</p>
				</button>
				<button v-else class="button">
					<fa icon="ban"/>
				</button>
				<button v-if="appearNote.myReaction == null" class="button" @click="react()" ref="reactButton">
					<fa-layers>
						<fa :icon="faLaugh"/>
						<fa icon="plus" transform="shrink-8 down-4 right-5" style="color: var(--noteActionsReactionHover)"/>
					</fa-layers>
				</button>
				<button v-if="appearNote.myReaction != null" class="button reacted" @click="undoReact(appearNote)" ref="reactButton">
					<fa :icon="faLaugh"/>
				</button>
				<button class="button" @click="menu()" ref="menuButton">
					<fa icon="ellipsis-h"/>
				</button>
				<button v-if="$store.state.device.showTlPin" class="button stayTl" :class="{ pinned: !!appearNote.stayTl }" @click="toggleStayTl"><fa icon="thumbtack"/></button>
			</footer>
			<div class="deleted" v-if="appearNote.deletedAt != null">{{ $t('deleted') }}</div>
		</div>
	</article>
	<x-sub v-for="note in replies" :key="note.id" :note="note"/>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import i18n from '../../../i18n';

import XSub from './note.sub.vue';
import noteMixin from '../../../common/scripts/note-mixin';
import noteSubscriber from '../../../common/scripts/note-subscriber';
import XInstanceInfo from '../../../common/views/components/instance-info.vue';
import { faLaugh } from '@fortawesome/free-regular-svg-icons';

export default Vue.extend({
	i18n: i18n('mobile/views/components/note.vue'),
	components: {
		XSub,
		XInstanceInfo
	},

	mixins: [
		noteMixin({
			mobile: true
		}),
		noteSubscriber('note')
	],

	props: {
		note: {
			type: Object,
			required: true
		},
		detail: {
			type: Boolean,
			required: false,
			default: false
		},
		preview: {
			type: Boolean,
			required: false,
			default: false
		},
	},

	inject: {
		narrow: {
			default: false
		}
	},

	data() {
		return {
			faLaugh,
			conversation: [],
			replies: []
		};
	},

	created() {
		if (this.detail) {
			this.$root.api('notes/children', {
				noteId: this.appearNote.id,
				limit: 30
			}).then(replies => {
				this.replies = replies;
			});

			this.$root.api('notes/conversation', {
				noteId: this.appearNote.replyId
			}).then(conversation => {
				this.conversation = conversation.reverse();
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.note
	overflow hidden
	font-size 13px
	border-bottom solid var(--lineWidth) var(--faceDivider)

	&:last-of-type
		border-bottom none

	&:not(.mini)

		@media (min-width 350px)
			font-size 14px

		@media (min-width 500px)
			font-size 16px

		> .article
			@media (min-width 600px)
				padding 16px 32px

			> .avatar
				@media (min-width 350px)
					width 48px
					height 48px
					border-radius 6px

				@media (min-width 500px)
					margin-right 16px
					width 58px
					height 58px
					border-radius 8px

			> .main
				> .body
					@media (min-width 700px)
						font-size 1.1em

	&.smart
		> .article
			> .main
				> header
					align-items center
					margin-bottom 4px

	> .renote + .article
		padding-top 8px

	> .reply-to
		&.coloring-bg
			&.visibility-home
				background-color var(--noteHomeBg)

			&.visibility-followers
				background-color var(--noteFollowersBg)

			&.visibility-specified
				background-color var(--noteSpecifiedBg)

		&.coloring-left
			border-left: transparent solid 5px

			&.visibility-home
				border-left-color var(--noteHomeBorder)

			&.visibility-followers
				border-left-color var(--noteFollowersBorder)

			&.visibility-specified
				border-left-color var(--noteSpecifiedBorder)

	> .article
		display flex
		padding 12px 12px 6px

		&.coloring-bg
			&.visibility-home
				background-color var(--noteHomeBg)

			&.visibility-followers
				background-color var(--noteFollowersBg)

			&.visibility-specified
				background-color var(--noteSpecifiedBg)

		&.coloring-left
			border-left: transparent solid 5px

			&.visibility-home
				border-left-color var(--noteHomeBorder)

			&.visibility-followers
				border-left-color var(--noteFollowersBorder)

			&.visibility-specified
				border-left-color var(--noteSpecifiedBorder)

		> .avatar
			flex-shrink 0
			display block
			margin 0 10px 8px 0
			width 42px
			height 42px
			border-radius 6px
			//position -webkit-sticky
			//position sticky
			//top 62px

		> .main
			flex 1
			min-width 0

			> .body
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
						display block
						margin 0
						padding 0
						overflow-wrap break-word
						color var(--noteText)
						max-height 200px
						overflow auto
						font-size 1em

						> .reply
							margin-right 8px
							color var(--noteText)

						> .rp
							margin-left 4px
							font-style oblique
							color var(--renoteText)

					.mk-url-preview
						margin-top 8px

					> .files
						> img
							display block
							max-width 100%

					> .location
						margin 4px 0
						font-size 12px
						color #ccc

					> .map
						width 100%
						height 200px

						&:empty
							display none

					> .mk-poll
						font-size 80%

					> .renote
						margin 0.3em 0.6em
						opacity 0.9

						> *
							padding 0.7em
							border-left 3px solid var(--mfmQuoteLine)

				> .app
					font-size 12px
					color #ccc

			> .footer
				> .button
					margin 0
					padding 8px
					background transparent
					border none
					box-shadow none
					font-size 1em
					color var(--noteActions)
					cursor pointer

					&:not(:last-child)
						margin-right 16px

					&:hover
						color var(--noteActionsHover)

					> .count
						display inline
						margin 0 0 0 8px
						color var(--text)
						opacity 0.7
						font-size 0.8em

					&.reacted
						color var(--noteActionsReactionHover)

					&.renoted
						color var(--primary)

					&.stayTl
							opacity 0.7
							&.pinned
								opacity 1
								color var(--primary)

			> .deleted
				color var(--noteText)
				opacity 0.7

</style>
