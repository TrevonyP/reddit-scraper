require('dotenv').config();
require('log-timestamp');
const subreddits = require('./subreddit_list.js');
const subreddits_control = require('./subreddit_list_control.js');
const vader = require('vader-sentiment');
const snoowrap = require('snoowrap');
const fs = require('fs')
/*
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvWriter = createCsvWriter({
    path: 'test_results.csv',
    header: [
        {id: 'id', title: 'POST_ID'},
        {id: 'subreddit', title: 'r/'},
        {id: 'url', title: 'URL'},
        {id: 'title', title: 'POST_TITLE'}
    ],
    fieldDelimiter: ','
});
*/

const jsonexport = require('jsonexport');

var subreddit_list, csv_file

/*if (process.env.USE_CONTROL) {
	subreddit_list = subreddits_control.array
	csv_file = "results_control.csv"
} else {
	subreddit_list = subreddits.array
	csv_file = "results.csv"
}*/

subreddit_list = subreddits.array
csv_file = "results.csv"

// var subreddit_list = subreddits.array;

const CLIENT_ID = process.env.R_CLIENTID;
const CLIENT_SECRET = process.env.R_CLIENTSECRET;
const REFRESH_TOKEN = process.env.R_REFRESHTOKEN;
const GET_POST_LIMIT = 10;
const GET_COMMENTS_LIMIT = 20;

const r = new snoowrap({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    refreshToken: REFRESH_TOKEN,
});

function getRandomInt(max) {
	return Math.floor(Math.random() * Math.floor(max));
}

async function scrapeSubreddit() {

//  	const subreddit = await r.getSubreddit('depressed');
//  	const newPosts = await subreddit.getNew({limit: 20});


//  	var randomPost = await r.getRandomSubmission('depressed');

//  const topPosts = await subreddit.getTop({time: 'week', limit: 3});
//  const comments = await r.getSubmission('t5_2r8rq').expandReplies({limit: Infinity, depth: Infinity}).then(console.log)

	let scraped_posts = [];
  	let data = [];
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

		  			var results = {
			  			POST_ID: post.name,
			  			POST_URL: post.url,
			  			POST_TITLE: post.title,
			  			SUBREDDIT_NAME: post.subreddit.display_name,
			  			USER_NAME: comment.author.name,
			  	//		USER_ACTIVITY:
			  	//		USER_ANON_SCORE:
			  			COMMENT_ID: comment.name,
			  			COMMENT_CREATED_UTC: comment.created_utc,
			  			COMMENT_TEXT: comment_text,
			  			COMMENT_NEG_SCORE: sentiment_scores.neg,
			  			COMMENT_NEU_SCORE: sentiment_scores.neg,
			  			COMMENT_POS_SCORE: sentiment_scores.pos,
			  			COMMENT_COMP_SCORE: sentiment_scores.compound,
			  		}

			  		data.push(results)
		  		}
		  		




		  		/*
		  		let results = {
		  			POST_ID: post.name,
		  			POST_URL: post.url,
		  			POST_TITLE: post.title,
		  			SUBREDDIT_NAME: post.subreddit.display_name,
		  			USER_ID:
		  			USER_NAME:
		  			USER_COMMENT_CREATED_AT: [ps]
		  			USER_COMMENT: post.comments
		  		}*/
		  		/*
		  		post.comments.forEach((comment) => {
		  			data.push({
		  				text: comment.body
		  			})
		  		})
		  		
		  		console.log(data)
		  		*/

		  		//post.expandReplies().then(console.log(comments[0]))
		  		//console.log(post.comments[0])
		  		//return

		  		/* WORKING:...
		  		let results = {
		  			POST_ID: post.name,
		  			SUBREDDIT_NAME: post.subreddit.display_name,
		      		URL: post.url,
		      		TITLE: post.title
		  		}
		  		*/

		  		//data.push(results)

		  		//await csvWriter.writeRecords(results)
		  	}
  		}
  		j = 0;
  	}
/*
  	newPosts.forEach((post) => {
  		data.push({
      		link: post.url,
      		text: post.title,
      		score: post.score
    	})
  	});
*/

	try {
    	const csv = await jsonexport(data, {rowDelimiter: '|||'});
    	fs.writeFile(csv_file, csv, err => {
			if (err) {
		    	console.error(err)
		    	return;
		  	} else {
		  		console.log('...Done')
		  		//file written successfully
		  	}
		})
	} catch (err) {
    	console.error(err);
	}

	//console.log(data)
	/*
  	csvWriter.writeRecords(data)
    	.then(() => {
        	console.log('...Done');
    	});
    */
};

scrapeSubreddit()