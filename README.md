# 10x Hacker Bot
A bot that scrapes network requests for a website and detects security vulnerabilities using Code Llama

This was coded on my [Youtube live stream](https://www.youtube.com/watch?v=ihVBFnOii0g&t=6s) 

# How it works
### The Bot
The script runs a puppeteer instance that intercepts all http requests from page load. After the page load the script fills in a random form and submits it (simulating user data over the wire). 

After this we get all the intercepted requests and format them for LLM prompting (chunk the requests by 10 for context window optimization). In the end we send the prompt to Code Llama through an API I wrote in Colab (see below).

### The API from Colab
(if you want to change this and use llama.cpp please make a github issue and I'll address or message me on how to refactor for yourself)
The bot runs off of an API coded in [colab](https://colab.research.google.com/drive/1dkN1R8OkHfWHnDh7KucdXYuDMw4o96Td?usp=sharing) that's running flask/ngrok. The API is in front of Code LLama. You can run the colab here. *Remember you have to copy the ngrok url to the 10x-hacker-bot file*

Update this url with the new ngrok url from flask
```
	const apiUrl = "http://8c54-34-87-182-84.ngrok.io"; // change this line
```

# How to run
First `npm install` to get the `node_modules` directory

Running 10x-hacker-bot.js
```
$ node 10x-hacker-bot.js <website>
```

# Running the API (from colab)
You can choose to run the API from the [colab](https://colab.research.google.com/drive/1dkN1R8OkHfWHnDh7KucdXYuDMw4o96Td?usp=sharing) I have available which is a simple Flask app *or* simply download the code from the colab and run it locally if you'd prefer (if you have a quality GPU)

[The Colab Link](https://colab.research.google.com/drive/1dkN1R8OkHfWHnDh7KucdXYuDMw4o96Td?usp=sharing)