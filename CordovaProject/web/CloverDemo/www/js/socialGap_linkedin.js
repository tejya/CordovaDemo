/*********************************************************************************
 * The MIT License																 
 *																				 
 * Copyright (c) 2013 YanchWare ( https://www.yanchware.com  )					 
 * by: Angelo Agatino Nicolosi - angelo.nicolosi[at]yanchware.com				 
 * 																				 
 * Permission is hereby granted, free of charge, to any person obtaining a copy	 
 * of this software and associated documentation files (the "Software"), to deal 
 * in the Software without restriction, including without limitation the rights	 
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell	 
 * copies of the Software, and to permit persons to whom the Software is		 
 * furnished to do so, subject to the following conditions: 					 
 *																				 
 * The above copyright notice and this permission notice shall be included in	 
 * all copies or substantial portions of the Software.							 
 *																				 
 *********************************************************************************/

var SocialGap = (function (socialGap) {

	/*-----------------------------------------------------------------------
	/* Public fields
	/*----------------------------------------------------------------------*/
    socialGap.CurrentLinkedInToken = "";

	/*-----------------------------------------------------------------------
	/* Private fields
	/*----------------------------------------------------------------------*/
	var linkedinBaseApiURL = "https://www.linkedin.com/uas/oauth2/";
	var queryStringAuthCode = "code";
	var queryStringState = "state";
	var LS_TOKEN_KEY = "SocialGap_LinkedIn_Token";
	var extensionName = "LinkedIn";
	var baseCheckUrl = "https://api.linkedin.com/v1/people/~?oauth2_access_token=";
	var accessTokenKey = "access_token";

	var processing = true;
	var authorized = false;
	var currentState = "";

	var settings = {
		apiKey: "",
		secretKey: "",
		appDomain: "",
		scopes: ""
	};
	
	/*----------------------------------------------------------------------*/
	/* Public Method: Linkedin_ChangeSettings
	/*----------------------------------------------------------------------*/
	socialGap.Linkedin_ChangeSettings = function (apiKey, secretKey, appDomain, scopes) {
		settings.apiKey = apiKey;
		settings.secretKey = secretKey;
		settings.appDomain = appDomain;
		settings.scopes = scopes;
	};

	/*-----------------------------------------------------------------------
	/* Public functions
	/*----------------------------------------------------------------------*/
	socialGap.Linkedin_PerformLogon = function (onSuccess, onFailure) {
		if(!socialGap.isFunction(onSuccess) || !socialGap.isFunction(onFailure))
		{
			socialGap.logMsg(extensionName, "Illegal arguments. Call back functions are not defined.");
			return;
		}
		
		if(!socialGap.deviceReady)
		{
			socialGap.logMsg(extensionName, "Device is not ready.");
			return;
		}
				
		//If ExtendedToken is available just use it
		getStoredToken(function(isValidToken){
			if(!isValidToken)
			{
				socialGap.logMsg(extensionName, "Token not found in local storage or found invalid token. Requesting a new token.");
				localStorage.removeItem(LS_TOKEN_KEY);
				socialGap.CurrentLinkedInToken = "";
			  	getNewToken(onSuccess, onFailure);
			}else
			{
				socialGap.logMsg(extensionName, "Valid token found in local storage.");
				onSuccess(socialGap.CurrentLinkedInToken);
			}
		});
		
	}

	/*-----------------------------------------------------------------------
	/* Private functions
	/*----------------------------------------------------------------------*/

	function getNewToken(onSuccess, onFailure)
	{
		//Procedure for requiring a token:
		//1. generate an authorization code by redirecting the user to LinkedIn's authorization dialog
		//2. exchange authorization code for access token.
		
		getRandomStateString();
		var authorize_url = linkedinBaseApiURL + "authorization?response_type=code&client_id=" + settings.apiKey + "&scope=" + 
							settings.scopes + "&state="+ currentState + "&redirect_uri="+ settings.appDomain;

		ref = window.open(authorize_url, "_blank", "location=no");

		//Hooking listeners
		ref.addEventListener("loadstart", function (event) {
			var authCode = socialGap.extractInfoFromQueryString(event.url, queryStringAuthCode);
			var state = socialGap.extractInfoFromQueryString(event.url, queryStringState);
			if(authCode != null && state != null)
			{
				if(state == currentState)
				{
					socialGap.logMsg(extensionName, "Received authentication code. Exchanging it for access token...");
					ref.close();
					exchangeAuthCodeForAccessToken(authCode);
				}else
				{
					socialGap.logMsg(extensionName, "State does not match. Possible Cross-site request forgery. Aborting...");
					processing = false;	
					ref.close();
				}
			}
			
			if(event.url.indexOf('access_denied') > 0)
			{
				socialGap.logMsg(extensionName, "User did not allowed our application to access information on LinkedIn.");
				processing = false;
				ref.close();
			}
		});

		ref.addEventListener("loadstop", function (event) {

			socialGap.getContents(event.url, function(contents){
				if(contents != null)
				{
					if(contents.indexOf('alert error') > 0)
					{
						socialGap.logMsg(extensionName, "Exception during logon.");
						processing = false;
					}else
				 		//Extra steps required
						processing = true;
				}else
				{
					alert(contents);
					//Error loading page
					socialGap.logMsg(extensionName, "Error loading page " + event.url + ". Aborting...");
					processing = false;
					ref.close();
				}
			});

		});

		ref.addEventListener("loaderror", function (event) {
			socialGap.logMsg(extensionName, "Error loading: " + event.url);
			ref.close();
			onFailure();
		});

		ref.addEventListener("exit", function (event) {
			checkOutput(onSuccess, onFailure);
		});

	}
	
	/** Wait for completition of the async calls against the LinkedIn API */	
	function checkOutput(onSuccess, onFailure)
	{
		if(!processing && socialGap.CurrentLinkedInToken.length <= 0
			|| processing && !authorized && socialGap.CurrentLinkedInToken.length <= 0)
		{
			onFailure();
			return;
		}

		if(socialGap.CurrentLinkedInToken.length > 0)
		{
			socialGap.logMsg(extensionName, "Authentication Succeeded. Returning token.");
			onSuccess(socialGap.CurrentLinkedInToken);
			return;
		}

		window.setTimeout(function(){
			checkOutput(onSuccess, onFailure);
		}, 100);
	}
			
	function exchangeAuthCodeForAccessToken(authCode)
	{
		authorized = true;
		processing = true;
		
		var apiUrl = linkedinBaseApiURL + "accessToken?grant_type=authorization_code&code="+ authCode +"&redirect_uri=" + 
						settings.appDomain + "&client_id=" + settings.apiKey + "&client_secret=" + settings.secretKey;
		
		socialGap.getJsonContents(apiUrl, function(jsonObj){
			if(jsonObj != null)
			{
				if((typeof jsonObj.error) == 'undefined')
				{
					socialGap.checkToken(baseCheckUrl + jsonObj.access_token, function(isValid){
						if(isValid)
						{
							socialGap.logMsg(extensionName, "Access token received and valid. Storing token...");
							socialGap.CurrentLinkedInToken = jsonObj.access_token;
							socialGap.storeToken(LS_TOKEN_KEY, jsonObj.access_token);
						}else
						{
							socialGap.logMsg(extensionName, "Received invalid token. Aborting...");
							processing = false;
						}
					});
				}else
				{
					socialGap.logMsg(extensionName, "Error: " + jsonObj.error_description);
					processing = false;
				}
			}else
			{
				socialGap.logMsg(extensionName, "Received data in unknown format during exchange for Access Token. Aborting...");
				processing = false;
			}
		});
		
	}
	
	/* Get random string for CSRF prevention [http://en.wikipedia.org/wiki/Cross-site_request_forgery] */	
	function getRandomStateString()
	{
		var text = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		var arr = new Array(21);

	    for( var i=0; i < 20; i++ )
	        arr[i] = possible.charAt(Math.floor(Math.random() * possible.length));

	    currentState = arr.join('');
	}
	
	/** Utility - get the stored long-lived token if any and check its validity */
	function getStoredToken(callback)
	{
		socialGap.getStoredToken(LS_TOKEN_KEY, function(token){
			if(token != null)
			{
				socialGap.CurrentLinkedInToken = token;
				socialGap.checkToken(baseCheckUrl + token, callback);
			}else callback(false);
		});		
	}

	return socialGap;

}(SocialGap || {}));