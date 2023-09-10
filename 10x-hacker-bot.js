const fs = require('fs');
const { program } = require('commander');
const generator = require('generate-password');
const request_client = require('request-promise-native');
const { setupBrowser, timeout } = require('./utils');

let listenToFormRequests = false;
let formRequests = []

const apiUrl = "http://8c54-34-87-182-84.ngrok.io";


program
  .argument('<website>', 'Website you want to find vulnerabilities for');

program.parse(process.argv);

const options = program.args

const website = options[0]

function chunkRequests(requests, chunkSize) {
	const requestChunks = []

	while (requests.length > 0) {
		const chunk = requests.splice(0, chunkSize)
		requestChunks.push(chunk)
	}
	console.log("Got chunks")
	return requestChunks
}

function getVulnerabilitiesPrompt(httpRequests) {
	// rule for the data we're using
	// 1) always include the URL and http method
	// 2) always include response/request headers
	// 3) include response body but only include the body if it's json file
	// 4) filter all image/style assets

	const httpRequestPromptInfo = httpRequests.filter((request) => {
		const isJsAsset = request.request_url.indexOf(".js") > -1 
		const isImage = request.response_headers['content-type'].includes('image/')
		return isJsAsset && !isImage
	}).map((request) => {
		let useResponseBody = false
		try {
			JSON.parse(request.response_body)	
			useResponseBody = true
		} catch(e) {
		}

		const responseBody = useResponseBody ? `RESPONSE BODY: ${request.response_body}` : ""

		return `[NETWORK REQUEST INFO]\nHTTP METHOD: ${request.request_method}\nREQUEST URL: ${request.request_url}\nREQUEST HEADERS: ${JSON.stringify(request.request_headers)}\nRESPONSE HEADERS:${JSON.stringify(request.response_headers)}\n${responseBody}`
	}).join("\n\n")


	return `
	[INST]
	<<SYS>>

	You are a web security engineer bot. You are excellent at analyzing http network requests from a client browser. 
	
	You must follow these rules:
	- Your role is to guess what this website's possible security vulnerabilities are based on the given http request information.
	- You need to COMPARE and CONTRAST this series of website network requests to determine these possible web security vulnerabilities
	- Assume that there is sensitive data associates with these requests.
	- Before you respond with the vulnerabilities, list out what technologies/frameworks/libraries/cloud platforms/vendors/etc are being utilized by this website.
	- Create an exhaustive list of what each vulnerability is and a description of how you got to that conclusion
	- Limit your reasonings for why you chose these vulnerabilities to 1-2 sentences. No more than 2 sentence descriptions.
	- Each vulnerability you mention MUST be related to the network infromation you've been given. You must cite each vulnerability with snippets from the network information

	Here is the format of the http request:
	[NETWORK REQUEST INFO]
	HTTP METHOD: ...
	REQUEST URL: ...
	REQUEST HEADERS: ...
	RESPONSE HEADERS: ...
	RESPONSE BODY: ...

	The request and response headers are formatted in json. 

	Respond with only the server architecture you guessed and the list of security vulnerabilities you determined based on analyzing the network requests as well as your reasonings.
	<</SYS>>

	${httpRequestPromptInfo}

	[/INST]
	`
}

function getVulnerabilitySummarizerPrompt(summaries) {
	return `
	[INST]
	<<SYS>>

	You are a technical information summarizer bot. You are excellent at taking many summaries of technical information and summarizing the information.
	
	You must follow these rules:
	- You must summarize all the summaries together without missing any unique information.
	- You must de-duplicate the information so it is succinct.
	- Keep your response as a list of information itemized with stars '*'

	Here is the format of the summaries:
	[SUMMARY]
	the summary...

	Do not respond with any code or anything not related to summarizing the given summaries. You MUST only respond with your summary of the given user summaries.
	<</SYS>>

	${summaries.map((summary) => {
		return `[SUMMARY]\n${summary}`
	}).join('\n\n')}

	[/INST]`

}

async function summarizeVulnerabilityChunks(summaries) {
	const prompt = getVulnerabilitySummarizerPrompt(summaries);

	const response = await fetch(apiUrl+'/generate', {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json"
		},
		body: JSON.stringify({
			prompt
		})
	});

	const output = await response.json()
	const summary = output["output"]
	return summary
}

async function UserFormJacking(page) {
	const password = generator.generate({
		length: 12,
		numbers: true,
		symbols: true,
		uppercase: true,
		lowercase: true
	});
	return await page.evaluate((password) => {
		const form = document.querySelector('form')
		if (!form) return;
		// fill form
		const inputs = Array.from(form.querySelectorAll('input, select'))
		for (let input of inputs) {
			if (input.getAttribute("type") === "submit" || input.getAttribute("type") === "button") {
				continue;
			} else if (input.getAttribute('type') === "password") {
			
				input.value = password
			} else if (input.getAttribute('type') === "radio"
				|| input.getAttribute('type') === "checkbox") {
				input.checked = "checked"
			} else if (input.tagName === "SELECT") {
				const options = Array.from(input.qoerySelectorAll('option'));
				input.value = options[options.length-1].value
			} else {
				input.value = "randomstring"
			}
			
		}

		form.submit()
		return
	}, password);

}


async function HackerBot(website) {
	const [browser, page] = await setupBrowser()
	
	await page.setRequestInterception(true)

	const pageRequests = [];
	formRequests = [];
	page.on('request', request => {
	    request_client({
	      uri: request.url(),
	      resolveWithFullResponse: true,
	    }).then(response => {
	      const request_method = request.method();
	      const request_url = request.url();
	      const request_headers = request.headers();
	      const request_post_data = request.postData();
	      const response_headers = response.headers;
	      const response_size = response_headers['content-length'];
	      const response_body = response.body;

	      const requestInfo = {
	      	request_method,
	        request_url,
	        request_headers,
	        request_post_data,
	        response_headers,
	        response_size,
	        response_body,
	      }

	      pageRequests.push(requestInfo);

	      // console.log(result);
	      request.continue();
	    }).catch(error => {
	      // console.error(error);
	      request.abort();
	    });
	});

	console.log("Initial page load for", website)
	try {
		await page.goto(website, {
			waitUntil: "networkidle0",
			timeout: 120000
		});
	} catch(e) {
		console.log(e)
		return null
	}

	console.log("Doing form jacking")
	await UserFormJacking(page)
	await timeout(5000);
	await browser.close()
	const requestChunks = chunkRequests(pageRequests, 10);

	const vulnerabilitySummaries = []
	console.log("CHUNKS COUNT:", requestChunks.length)
	for (let [i, requestChunk] of requestChunks.entries()) {
		console.log(i+1, "of", requestChunks.length)
		const prompt = getVulnerabilitiesPrompt(requestChunk)

		const response = await fetch(apiUrl + '/generate', {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json"
			},
			body: JSON.stringify({
				prompt
			})
		});

		let output;
		try {
			output = await response.json()
		} catch(e) {
			continue
		}
		let vulnerabilities = output["output"]
		console.log("\n\nvulnerabilities information:", vulnerabilities)
		vulnerabilities = vulnerabilities.split("[/INST]").join('')
		vulnerabilitySummaries.push(vulnerabilities)
	}
		
	console.log("\n\nSummarizing all the results...", vulnerabilitySummaries.length)
	const finalResult = await summarizeVulnerabilityChunks(vulnerabilitySummaries)

	const host = (new URL(website)).host
	fs.writeFileSync(`./vulnerabilites_${host}.txt`, finalResult)

	process.exit(0)
}




// const website = "https://www.github.com/login"
HackerBot(website)