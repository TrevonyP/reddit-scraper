require('dotenv').config();
require('log-timestamp');
const subreddits = require('./subreddit_list.js');
const subreddits_control = require('./subreddit_list_control.js');
const vader = require('vader-sentiment');
const snoowrap = require('snoowrap');
const fs = require('fs')
const moment = require('moment')
const jsonexport = require('jsonexport');

var subreddit_list, csv_file

if (process.env.USE_CONTROL === 'true') {
	subreddit_list = subreddits_control.array
	csv_file = "results_control.csv"
} else {
	subreddit_list = subreddits.array
	csv_file = "results.csv"
}

const CLIENT_ID = process.env.R_CLIENTID;
const CLIENT_SECRET = process.env.R_CLIENTSECRET;
const REFRESH_TOKEN = process.env.R_REFRESHTOKEN;
const GET_POST_LIMIT = 50;
const GET_COMMENTS_LIMIT = 30;
const REQUEST_DELAY = 1200;

const r = new snoowrap({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    refreshToken: REFRESH_TOKEN,
});

r.config({requestDelay: REQUEST_DELAY});

var stream = fs.createWriteStream(csv_file, {flags:'a'});

function getRandomInt(max) {
	return Math.floor(Math.random() * Math.floor(max));
}

function weighted_score(positive_score, upvotes, post_impressions) {
	let new_score, upvote_ratio;

	upvote_ratio = upvotes / post_impressions;
	new_score = positive_score * 10;

	if (upvote_ratio < 0.20) {
		new_score = new_score + 1.5;
	} else if (upvote_ratio < 0.25) {
		new_score = new_score + 2;
	} else if (upvote_ratio < 0.30) {
		new_score = new_score + 2.5;
	} else if (upvote_ratio < 0.35) {
		new_score = new_score + 3;
	} else if (upvote_ratio < 0.45) {
		new_score = new_score + 3.5;
	} else if (upvote_ratio < 0.55) {
		new_score = new_score + 4;
	} else if (upvote_ratio < 0.65) {
		new_score = new_score + 4.5;
	} else {
		new_score = new_score + 5;
	}

	// Maximum weighted score is 10
	if (new_score > 10) new_score = 10;

	return new_score;
}

async function user_email_verified(username) {

	var email_is_verified = false;

	var trophies = await r.getUser(username).getTrophies()

	for (var i = 0; i < trophies.trophies.length; i++) {

		if (trophies.trophies[i].award_id === 'o') {
				email_is_verified = true;
				break;
		}
	}
	return email_is_verified;

}

async function karma_to_cakeday_ratio(username) {

	var ratio, now, created_moment, created_days_ago, karma;

	var user_created_utc = await r.getUser(username).fetch().created_utc

	now = moment()
	created_moment = moment.unix(user_created_utc)
	// Converts the utc created time to days ago that account was created
	created_days_ago = now.diff(created_moment, "days")

	karma = await r.getUser(username).comment_karma

	if (karma < 0) {
		return 0;
	} else {
		return karma / created_days_ago;
	}
}

function username_breakdown(username) {
	var contains_sex = false, contains_gender = false;

	let s = username.toLowerCase()

	if (s.includes('boy') || s.includes('girl') || s.includes('man') || s.includes('woman') ||
	s.includes('men') || s.includes('women')) {
		contains_sex = true;
	}
	if (s.includes('guy') || s.includes('male') || s.includes('female') || s.includes('gay') || s.includes('lesbian') || 
	s.includes('transs') || s.includes('transg') || s.includes('gender') || s.includes('queer') ||
	s.includes('sexual') || s.includes('binary') || s.includes('cis')) {
		contains_gender = true;
	}

	let object = {
		contains_sex: contains_sex,
		contains_gender: contains_gender
	}

	return object;
}

async function anon_score(username) {

	// Anonymous scores start at 10
	let score = 10, email_is_verified = false, karma_ratio, username_info;

	if (username === "[deleted]") {
		email_is_verified = false;
	} else if (user_email_verified(username)) {
		email_is_verified = true;
		score -= 1;
	}

	// Can't use comment to cake day ratio becuase API limits comments to 25 posts
	
	if (username !== "[deleted]") {
		// Instead we can use Karma to Cake day ratio

		karma_ratio = await karma_to_cakeday_ratio(username)

		if (karma_ratio >= 10) score -= 3
		else if (karma_ratio >= 8) score -= 2.75
		else if (karma_ratio >= 6) score -= 2.50
		else if (karma_ratio >= 4) score -= 2.25
		else if (karma_ratio >= 2) score -= 2.00
		else if (karma_ratio >= 1.50) score -= 1.50
		else if (karma_ratio >= 1.00) score -= 1.00
		else if (karma_ratio >= 0.66) score -= 0.50
		else if (karma_ratio >= 0.33) score -= 0.25
		else if (karma_ratio > 0) score -= 0.10

		username_info = username_breakdown(username)

		if (username_info.contains_sex) {
			score -= 3
		}
		if (username_info.contains_gender) {
			score -= 3
		}
	}

	if (score < 0) score = 0;

	let object = {
		email_is_verified: email_is_verified,
		score: score
	}
	return object;
}

async function scrapeSubreddit() {

	let scraped_posts = [];
  	let data = [];
  	let post_data = [];
  	let temp_index;

  	for (var i = 0; i < subreddit_list.length; i++) {
  		for (var j = 0; j < GET_POST_LIMIT; j++) {

  			console.log(`Searching in subreddit: r/${subreddit_list[i]}`)

  			// We get a random post from the subreddit
	  		var post = await r.getRandomSubmission(subreddit_list[i]);

	  		if (!post.id) {
	  			console.log(`Subreddit cannot be found`)
	  			continue;

	  		} else if (scraped_posts.includes(post.id)) {
	  			j--;
	  			continue;

	  		} else {

	  			let scraped_comments = [];
	  			post_data = [];

	  			// Now, we should grab all of the comments under that post
		  		console.log(`Found random post id: ${post.name}`)

		  		scraped_posts.push(post.name)
		  		
		  		for (k = 0; k < post.num_comments; k++) {

		  			temp_index = getRandomInt(post.num_comments)

		  			if (scraped_comments.includes(temp_index)) continue;

		  			scraped_comments.push(temp_index)

		  			if (!post.comments[temp_index]) break;
		  			// We take a maximum of 20 comments per post
		  			else if (k == GET_COMMENTS_LIMIT) break;
		  			// It avoids comments from Original Poster (OP)
		  			else if (post.comments[temp_index].is_submitter) continue;
		  			// It avoids comments from bots
		  			else if (post.comments[temp_index].author.name === 'AutoModerator') continue;

		  			let comment = post.comments[temp_index]

		  			let sentiment_scores = vader.SentimentIntensityAnalyzer.polarity_scores(comment.body)
		  			let comment_text = comment.body.replace(/[\n\r]+/g, ' ');


		  			user_anon_score_obj = await anon_score(comment.author.name)
		  			pos_score_weig = weighted_score(sentiment_scores.pos, comment.score, post.score + post.num_comments)

		  			var results = {
			  			POST_ID: post.name,
			  			POST_URL: post.url,
			  			POST_UPVOTES: post.score,
			  			POST_TITLE: post.title,
			  			SUBREDDIT_NAME: post.subreddit.display_name,
			  			USER_NAME: comment.author.name,
			  			USER_EMAIL_VERIFIED: user_anon_score_obj.email_is_verified,
			  			USER_ANON_SCORE: user_anon_score_obj.score,
			  			COMMENT_ID: comment.name,
			  			COMMENT_CREATED_UTC: comment.created_utc,
			  			COMMENT_TEXT: comment_text,
			  			COMMENT_UPVOTES: comment.score,
			  			COMMENT_NEG_SCORE: sentiment_scores.neg,
			  			COMMENT_NEU_SCORE: sentiment_scores.neu,
			  			COMMENT_POS_SCORE: sentiment_scores.pos,
			  			COMMENT_COMP_SCORE: sentiment_scores.compound,
			  			COMMENT_POS_SCORE_WEIGHTED: pos_score_weig
			  		}
			  		data.push(results)

					let results_csv = post.name + "|||" + post.url + "|||" + post.score + "|||" + 
					post.title + "|||" + post.subreddit.display_name + "|||" + comment.author.name + "|||" +
					user_anon_score_obj.email_is_verified + "|||" + user_anon_score_obj.score + "|||" +
					comment.name + "|||" + comment.created_utc + "|||" + comment_text + "|||" + 
					comment.score + "|||" + sentiment_scores.neg + "|||" + sentiment_scores.neu + "|||" +
					sentiment_scores.pos + "|||" + sentiment_scores.compound + "|||" + pos_score_weig + "\n";

			  		stream.write(results_csv)
		  		}
		  	}
  		}
  		j = 0;
  	}

  	console.log(`... Done. Successfully scraped ${data.length} comments.`)
};

scrapeSubreddit()
