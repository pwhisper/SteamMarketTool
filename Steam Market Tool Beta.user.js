// ==UserScript==
// @name         Steam Market Tool Beta
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Filter New Listings
// @author       SierraOne
// @match        steamcommunity.com/market/
// @grant
// ==/UserScript==
/* jshint -W097 */

//Track requests since start of session
var queries=0;
function updateTitle()
{
    queries++;
    document.title="Requests: "+queries;
}

//get main container
var x=document.getElementById("sellListingRows");

//create space for request text (price comparisons
var htmlRequest=document.createElement("div");
htmlRequest.style.display="none";
htmlRequest.id="httpRequest";
document.querySelector("div.pagecontent").appendChild(htmlRequest);

//detect keypresses
window.addEventListener('keydown', KeyCheck, true);

//timer to limit requests/hour
var allowRefresh=true;
var refreshTimer;
function startTimer()
{
    refreshTimer=setInterval(function()
                             {
        if (!allowRefresh)
        {
            allowRefresh=true;
            x.style.border="5px solid green";
        }
        clearInterval(refreshTimer);   
    },2000);
}

//handle keypresses
function KeyCheck(e)
{
    if (e.keyCode==82)
    {
        if (allowRefresh)
        {
            x.style.border="5px solid red";
            switchTabs();
            updateTitle();

            //main function
            var interval = setInterval(function() {
                if(document.readyState === 'complete') {
                    clearInterval(interval);
                    processResults();
                }    
            }, 800);

            //apply various filters and overlays, and disable refreshing
            function processResults()
            {
                var y=document.querySelectorAll('div.market_recent_listing_row');

                y=filter(y,filterByRecent,false);  //remove non-recent listings 
                y=filter(y,filterCSGO,true);      //remove non-CSGO listing
                y=filter(y,removeCopies,false);   //remove old opened buy windows
                y=filter(y,filterByName,true);    //remove listings with blacklisted words
                y=filter(y,filterByPrice,true);   //remove sold and non-budget listings

                overlayPriceInfo(y);         //display minprice
                viabilityOverlay(y);         //compare market listings
                allowRefresh=false;
                startTimer();
            }
        }
    }
    //detect e keypress
    else if (e.keyCode==69)
    {
        var checkboxSSA=document.getElementsByName("accept_ssa")[0];
        checkboxSSA.checked=true;
    }
}


//switch or refresh recent tab
function switchTabs()
{
    var tab=document.getElementById("tabRecentSellListings");
    eventFire(tab,'click');
    var gameButton=document.querySelectorAll("a.game_button")[4];
    gameButton.focus();
    gameButton.blur();
}


//event creator for keypress
function eventFire(el, etype){
    if (el.fireEvent) {
        el.fireEvent('on' + etype);
    } else {
        var evObj = document.createEvent('Events');
        evObj.initEvent(etype, true, false);
        el.dispatchEvent(evObj);
    }
}

//find comparisons on market
function openLink(url,minPrice,gameName)
{
    var newGameNameSpace=document.createElement("span");
    var myBr=document.createElement("br");
    var percentage=0;
    newGameNameSpace.id="viabilityRating";
    gameName.parentNode.appendChild(myBr);
    gameName.parentNode.appendChild(newGameNameSpace);
    var priceList=[];
    var currentPrice=0;
    var priceString="";

    //find prices for item
    function extractPrices()
    {
        htmlRequest.innerHTML=httpGet(url);

        var listings=htmlRequest.querySelectorAll("div.market_listing_row");
        for (var j=0;j<listings.length;j++)
        {
            priceString=listings[j].querySelector("span.market_listing_price_with_fee").innerHTML.trim();   
            if (priceString!="Sold!")
            {

                currentPrice=parseFloat(priceString.substring(5,priceString.length)).toFixed(2);  

                priceList.push(currentPrice);   

            }
        }
        var storageValueString=priceList.join("/");
        setStorage(url,storageValueString);
    }


    //check if key exists
    if (localStorage.getItem(url))
    {
        if (!checkStorageExpire(url))
        {
            var storagePriceArray=localStorage.getItem(url).split("/");
            for (var m=0;m<storagePriceArray.length;m++)
            {
                priceList.push(parseFloat(storagePriceArray.pop()));   
            }
        }
    }
    else
    {
        extractPrices(); 
    }
    //update new namespace
    var results=compareResults(minPrice,priceList);
    newGameNameSpace.innerHTML=results[0];
    newGameNameSpace.style.color=results[1];
    htmlRequest.innerHTML="";
    //
}

//retrieve target URL's HTML data
function httpGet(theUrl)
{
    var xmlHttp = null;

    xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false);
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

//create key and priceList in local Storage
function setStorage(url, value)
{
    localStorage.setItem(url,value);
    var date = new Date();
    var schedule=Math.round((date.setSeconds(date.getSeconds()+120))/1000);
    localStorage.setItem(url+"_time",schedule);
}

//check datestamp to ensure fresh data
function checkStorageExpire(url)
{
    var date = new Date();
    var current = Math.round(+date/1000);

    // Get Schedule
    var stored_time = localStorage.getItem(url+'_time');
    if (stored_time===undefined || stored_time=='null') { stored_time = 0; }

    // Expired
    if (stored_time < current) {
        localStorage.removeItem(url);
        localStorage.removeItem(url+"_time");
        return 1;
    } else {
        return 0;
    }
}

//a general all-purpose filter function
function filter(listingArray,filterFunction,deleteListing)
{
    var resultArray=[];
    var arrayLength=listingArray.length;
    for (var j=0;j<arrayLength;j++)
    {
        if(filterFunction(listingArray[j]))
        {
            resultArray.push(listingArray[j]);
        }
        else
        {
            if (deleteListing)
            {
                listingArray[j].style.display="none";   
            }
        }
    }
    return resultArray;
}

//remove non-CSGO inputs
function filterCSGO(listing)
{
    return findGameName(listing).innerHTML=="Counter-Strike: Global Offensive";
}

//remove non-recent listings
function filterByRecent(listing)
{
    return (listing.id.indexOf("listing_sell_new_") > -1);
}

//remove sold and overpriced items
function filterByPrice(listing)
{
    var priceLimit=document.getElementById("marketWalletBalanceAmount").innerHTML;
    priceLimit=priceLimit.substring(5,priceLimit.length);
    priceLimit=parseFloat(priceLimit);

    var itemPrice=listing.querySelector("span.market_listing_price_with_fee").innerHTML;
    var price=itemPrice.trim().substring(5,itemPrice.length);
    return (price!="Sold!" && parseFloat(price)<=priceLimit);
}

//remove blacklisted words
function filterByName(listing)
{
    var name=listing.querySelector("a.market_listing_item_name_link").innerHTML;
    var filteredWords=["Sticker"," Case","Gift Package"," Capsule"," Key", " Pass", "Name Tag","Music Kit","ESL ","DreamHack "];
    if (new RegExp(filteredWords.join("|")).test(name)) {
        return 0;
    }
    return 1;
}
//displays minimum price required for profit
function overlayPriceInfo(listingArray)
{
    var listing;
    for (var j=0;j<listingArray.length;j++)
    {
        listing=listingArray[j];
        var minimumPrice=findMinPrice(listing);
        var itemPrice=listing.querySelector("span.market_listing_price_with_fee");
        var extraPriceSlot=listing.querySelector("span.market_listing_price_with_publisher_fee_only");
        extraPriceSlot.style.display="block";
        var price=itemPrice.innerHTML.trim().substring(5,itemPrice.length);
        extraPriceSlot.innerHTML="$"+minimumPrice; 
        itemPrice.style.fontSize="100%";
        extraPriceSlot.style.fontSize="130%";
        extraPriceSlot.style.marginTop="8%";
    }
}
//displays metrics based on prices from openLink
function viabilityOverlay(listingArray)
{
    var listing;
    for (var j=0;j<listingArray.length;j++)
    {
        listing=listingArray[j];
        var name=listing.querySelector("a.market_listing_item_name_link"); 
        name.target="_blank";
        openLink(name.href,findMinPrice(listing),findGameName(listing)); 
    }

}
//find the minimum sale price
function findMinPrice(listing)
{
    var itemPrice=listing.querySelector("span.market_listing_price_with_fee");
    var price=itemPrice.innerHTML.trim().substring(5,itemPrice.length);
    return (price*1.15+0.05).toFixed(2);

}
//find game name
function findGameName(listing)
{
    return listing.querySelector("span.market_listing_game_name");   
}

//give a metric based on results
function compareResults(minPrice, priceList)
{
    var percentage=0;
    if (minPrice<=priceList[0])
    {
        percentage=0;
        percentage=" +"+(((priceList[0]-minPrice)/minPrice)*100).toFixed(1)+"%";
        return  ["VIABLE BUY"+percentage,"green"];

    }
    else if (minPrice>=priceList[priceList.length-1])
    {
        percentage=0;
        percentage=" +"+(((minPrice-priceList[0])/priceList[0])*100).toFixed(1)+"%";
        return  ["NOT VIABLE"+percentage,"red"];
    }
    else 
    {
        var ranking=0;
        for (var k=0;k<priceList.length;k++)
        {
            if (priceList[k]>=minPrice)
            {   
                ranking=k+1;
                break;
            }
        }
        return  ["Price Rank # "+ranking,"yellow"];
    }
}

//remove copies of listings from previous buy windows
function removeCopies(listing)
{
    var listingID=listing.id;
    return (listingID.indexOf("Copy")<0);   
}
