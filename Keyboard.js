const hid = require('node-hid');
const request = require('request');
const aws = require('aws-sdk')
const loudness = require('loudness');
const os 	= require('os-utils');
const disk = require('diskusage')
const fs = require('fs');
const weatherApiKey = require('./config');

// Define the productId and vendorId for the Nibble
const productId = 24672;
const vendorId = 28257;

// These are the possible usage / usagePage combinations
// I've found that 97 & 65376 works
// (6, 1), (97, 65376), (128, 1), (6, 1), (1, 12)
const usage = 97;
const usagePage = 65376;

// Name of our DynamoDB table which holds stock information
const tableName = "Stocks";

// Set up AWS credentials for DynamoDB access
aws.config.update({region: "us-east-1"});
let credentials = new aws.SharedIniFileCredentials({profile:'default'});
aws.config.credentials = credentials;

// This will hold a reference to our hid device
let keyboard = null;

// Just a helper function to wait a specified amount of time
function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

// Get the current stock price, and the price at the start of the day
function getStartingAndCurrentStockPrice(stockMap) {
    let currentLowestDate = new Date();
    let currentHighestDate = new Date("2000-01-01");
    let startingStockPrice = -1;
    let currentStockPrice = -1;
    for (let [dateTimeString, stockPrice] of stockMap) {
        dateTime = new Date(dateTimeString);
        if (currentLowestDate - dateTime > 0) {
            currentLowestDate = dateTime;
            startingStockPrice = stockPrice;
        }
        if (dateTime > currentHighestDate) {
            currentStockPrice = stockPrice;
        }
    }
    return [parseFloat(startingStockPrice), parseFloat(currentStockPrice)];
}


let stockMsg = new Array(360).fill(0);
async function startStockMonitor() {
    let allValues = false;
    let stocks = new Map();

    // Query our DynamoDB table for stock information
    function getStocks() {
        const stocks = new Map();
        allValues = false;
        let docClient = new aws.DynamoDB.DocumentClient();
        docClient.scan({TableName: tableName}, onScan);
    };

    function onScan(err, data) {
        if (err) console.log(err, err.stack);
        data.Items.forEach(function(itemdata) {
            if (!stocks.has(itemdata.Ticker)) {
                stocks.set(itemdata.Ticker, new Map());
            }
            stocks.get(itemdata.Ticker).set(itemdata.Timestamp, itemdata.MarketPrice);
        })
        allValues = true;
    }

    while (true) {
        getStocks();

        while (!allValues) {
            await wait(2000);
        }

        for (let [stock, stockPoints] of stocks) {
            await wait(10000);
            let thisStock = stock.padEnd(5);
            let [priceStart, priceWhole] = getStartingAndCurrentStockPrice(stockPoints);
            let priceWholeSmall = priceWhole;
            let priceWholeBig = priceWhole >> 8;
            let priceFractional = Math.round((priceWhole % 1)*100);
            let pDiff = ~~((priceWhole - priceStart) / priceStart * 100);
            pDiff = pDiff + 128;
            let topBottom;
            if (stockPoints.has(10)) {
                if (stockPoints.get(10) > 16) {
                    topBottom = 0;
                } else {
                    topBottom = 1;
                }
            } else {
                topBottom = 0;
            }
            stockMsg = [pDiff, priceWholeBig, priceWholeSmall, priceFractional, topBottom, thisStock.charCodeAt(0), thisStock.charCodeAt(1), thisStock.charCodeAt(2), thisStock.charCodeAt(3), thisStock.charCodeAt(4)];
            
            for (let i = 5; i < stockMsg.length; i++) {
                if (stockMsg[i] == 32) {
                    // accounting for spaces in unicode
                    stockMsg[i] = 64;
                }
            }

            let pts = createStockLine(stockPoints);
            for (let [x, y] of pts) {
                stockMsg.push(x);
                stockMsg.push(y);
            }

            while (stockMsg.length < 390) {
                stockMsg.push(0);
            }

            if (currentScreen == 1) {
                sendDataToKeyboard(stockMsg);
            }
        }
    }
}

// Kelvin to Fahrenheit
function kToF(K) {
    return Math.round((K-273.15)*(9/5)+32);
}


function isNight(sunriseTime, sunsetTime) { 
    let now = new Date();
    if (now.getTime()/1000 > sunriseTime && now.getTime()/1000 < sunsetTime) {
        return 0;
    }
    return 1;
}

// Icons for different weather conditions
// Based off of: https://www.alessioatzeni.com/meteocons/
// Converted to byte array using: https://javl.github.io/image2cpp/
let clear = fs.readFileSync('./icons/Clear_B.txt', 'utf8').split(',').map(Number);
let clearNight = fs.readFileSync('./icons/Clear_Night_B.txt', 'utf8').split(',').map(Number);
let cloudy = fs.readFileSync('./icons/Cloudy_B.txt', 'utf8').split(',').map(Number);
let drizzle = fs.readFileSync('./icons/Drizzle_B.txt', 'utf8').split(',').map(Number);
let fog = fs.readFileSync('./icons/Fog_B.txt', 'utf8').split(',').map(Number);
let haze = fs.readFileSync('./icons/Haze_B.txt', 'utf8').split(',').map(Number);
let heavyThunderstorm = fs.readFileSync('./icons/Heavy_Thunderstorm_B.txt', 'utf8').split(',').map(Number);
let lightThunderstorm = fs.readFileSync('./icons/Light_Thunderstorm_B.txt', 'utf8').split(',').map(Number);
let mist = fs.readFileSync('./icons/Mist_B.txt', 'utf8').split(',').map(Number);
let na = fs.readFileSync('./icons/NA_B.txt', 'utf8').split(',').map(Number);
let partlyCloudy = fs.readFileSync('./icons/Partly_Cloudy_B.txt', 'utf8').split(',').map(Number);
let partlyCloudyNight = fs.readFileSync('./icons/Partly_Cloudy_Night_B.txt', 'utf8').split(',').map(Number);
let rain = fs.readFileSync('./icons/Rain_B.txt', 'utf8').split(',').map(Number);
let rainHeavy = fs.readFileSync('./icons/Rain_Heavy_B.txt', 'utf8').split(',').map(Number);
let snowHeavy = fs.readFileSync('./icons/Snow_Heavy_B.txt', 'utf8').split(',').map(Number);
let windy = fs.readFileSync('./icons/Windy_B.txt', 'utf8').split(',').map(Number);
let windyDrizzle = fs.readFileSync('./icons/Windy_Drizzle_B.txt', 'utf8').split(',').map(Number);

// Prepopulate our weather message to be zeros
let weatherMsg = new Array(360).fill(0);


function addWeatherIcon(id, isNight) {
    let currentWeatherIcon;

    // weather ids from: https://openweathermap.org/weather-conditions
    if (id < 300) {
        if (id == 200 || id == 201 || id == 210 || id == 230 || id == 231 || id == 232) {
            currentWeatherIcon = lightThunderstorm;
        } else {
            currentWeatherIcon = heavyThunderstorm;
        }
    } else if (id < 400) {
        if (id == 300 || id == 301 || id == 310) {
            currentWeatherIcon = drizzle;
        } else {
            currentWeatherIcon = windyDrizzle;
        }
    } else if (id < 600) {
        if (id == 500 || id == 501) {
            currentWeatherIcon = rain;
        } else {
            currentWeatherIcon = rainHeavy;
        }
    } else if (id < 700) {
        currentWeatherIcon = snowHeavy;
    } else if (id < 800) {
        if (id == 701) {
            currentWeatherIcon = mist;
        } else if (id == 741) {
            currentWeatherIcon = haze;
        } else {
            currentWeatherIcon = fog;
        }
    } else if (id < 900) {
        if (id == 800) {
            if (isNight) {
                currentWeatherIcon = clearNight;
            } else {
                currentWeatherIcon = clear;
            }
        } else if (id == 802 || id == 803) {
            if (isNight) {
                currentWeatherIcon = partlyCloudyNight;
            } else {
                currentWeatherIcon = partlyCloudy;
            }
        } else {
            currentWeatherIcon = cloudy;
        }
    } else {
        currentWeatherIcon = clear;
    }

    // weather icon info starts at index 20 in weatherMsg
    currentWeatherIcon.forEach(function (value, i) {
        weatherMsg[20+i] = value;
    });

}
async function startWeatherMonitor() {
    function getWeather() {
        // Get the current weather conditions
        return new Promise((resolve) => {
            request(`https://api.openweathermap.org/data/2.5/weather?q=${zipCode}&appid=${weatherApiKey['weatherApiKey']}`, (err, res, body) => {
                weather = {};
                weather.res = res;
                weather.body = body;
                if (err) {
                    weather.err = err;
                    console.log(err);
                }

                let obj = JSON.parse(body);
                weatherMsg[0] = obj.weather[0].id; // current id
                weatherMsg[1] = obj.weather[0].id >> 8; // current id
                weatherMsg[2] = kToF(obj.main.temp); // current temp (F)
                weatherMsg[3] = kToF(obj.main.temp_min); // todays min temp
                weatherMsg[4] = kToF(obj.main.temp_max); // todays max temp
                weatherMsg[5] = kToF(obj.main.feels_like); // feels like temp
                weatherMsg[6] = isNight(obj.sys.sunrise, obj.sys.sunset); // flag for night time

                addWeatherIcon(obj.weather[0].id, isNight(obj.sys.sunrise, obj.sys.sunset) == 1);

                resolve(weather);
            });
        });
    }


    function getFutureWeather() {
        // Get future weather conditions
        return new Promise((resolve) => {
            request(`https://api.openweathermap.org/data/2.5/forecast?q=${zipCode}&appid=${weatherApiKey['weatherApiKey']}`, (err, res, body) => {
                weather = {};
                weather.res = res;
                weather.body = body;
                if (err) {
                    weather.err = err;
                    console.log(err);
                }

                let obj = JSON.parse(body);
                let dt = new Date(obj.list[1].dt * 1000);
                weatherMsg[10] = dt.getHours(); // time of next update
                weatherMsg[11] = kToF(obj.list[1].main.temp); // temperature at next update
                weatherMsg[12] = obj.list[1].weather[0].id; // id at next update
                weatherMsg[13] = obj.list[1].weather[0].id >> 8; // id  at next update
                try {
                    weatherMsg[14] = Math.round(obj.list[1].rain["3h"]); // chance of precip
                } catch (error) {
                    weatherMsg[14] = 0; // no chance of rain
                }

                resolve(weather);
            });
        });
    }

    while (true) {
        getWeather();
        await wait(1000);
        getFutureWeather();

        if (currentScreen == 2) {
            sendDataToKeyboard(weatherMsg);
        }
        await wait(180000);
    }
}

let perfMsg = new Array(30).fill(0);
async function startPerfMonitor() {
    
    function updatePerf() {
        os.cpuUsage(function(v) {
            perfMsg[2] = Math.round(v*100)+25; // cpu usage percent
        });
        disk.check('C:', function(err, info) {
            perfMsg[3] = ((info.total - info.free)/info.total) * 100 + 25;
        });
        perfMsg[1] = 100 - Math.round(os.freememPercentage()*100)+25; // RAM usage
        // perfMsg[3] = Math.round(os.loadavg(1))+25; // average usage over one minute
    }

    while (true) {
        updatePerf()
        const vol = await Promise.all([loudness.getVolume()]);
        perfMsg[0] = vol[0] + 25;
        
        if (currentScreen == 3) {
            sendDataToKeyboard(perfMsg);
        }
        await wait(250);
    }
}

class Coordinate {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}


function clamp(num, min, max) {
    return num <= min ? min : num >= max ? max : num;
}


function createStockLine(stockMap) {
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    var yyyy = String(today.getFullYear());

    let currentLowestDate = new Date();
    let startingStockPrice = 0;
    let highestStockPrice = 0;
    let lowestStockPrice = Infinity;
    for (let [dateTimeString, stockPrice] of stockMap) {
        dateTime = new Date(dateTimeString);
        if (currentLowestDate - dateTime > 0) {
            currentLowestDate = dateTime;
            startingStockPrice = stockPrice;
        }
        if (parseFloat(stockPrice) > parseFloat(highestStockPrice)) {
            highestStockPrice = stockPrice;
        }
        if (parseFloat(stockPrice) < parseFloat(lowestStockPrice)) {
            lowestStockPrice = stockPrice;
        }
    }

    let pDiff = Math.max((highestStockPrice-startingStockPrice)/startingStockPrice, Math.abs(lowestStockPrice-startingStockPrice)/startingStockPrice);
    let scale;
    if (pDiff < 0.03) {
        scale = 0.03;
    } else if (pDiff < 0.05) {
        scale = 0.05;
    } else if (pDiff < 0.08) {
        scale = 0.08;
    } else {
        scale = 0.12;
    }


    let prevX = 0;
    let prevY = startingStockPrice;
    let prevPt = new Coordinate(prevX, 16);
    let pts = new Map();
    let thisLinePts = new Map();
    let dateTimeStrings = Array.from(stockMap.keys());
    for (let dateTimeString of dateTimeStrings) {
        let stockPrice = stockMap.get(dateTimeString);
        let dateTime = new Date(dateTimeString);
        let x = Math.round((dateTime.getHours() * 60 + dateTime.getMinutes() - 8.5*60) * (128/(60*6.5)));
        let pStockChange = (stockPrice - startingStockPrice)/startingStockPrice;
        let y = clamp(16-pStockChange/scale*16, 0, 31);
        curPt = new Coordinate(x, y);
        thisLinePts = connectTwoOledPoints(prevPt, curPt);
        for (let [tx, ty] of thisLinePts) {
            pts.set(tx, ty);
        }
        prevPt = curPt;
    }
    return pts;
}

function connectTwoOledPoints(pt1, pt2) {
    let pts = new Map();
    pts.set(pt1.x, Math.round(pt1.y));
    pts.set(pt2.x, Math.round(pt2.y));
    let m = (pt2.y - pt1.y)/(pt2.x - pt1.x);
    for (let i = pt1.x; i < pt2.x; i++) {
        pts.set(i, Math.round(pt1.y - m*(pt1.x - i)));
    }
    return pts;
}

// Screens are, in order: [stocks, weather, performance]
let currentScreen = 1;
let numScreens = 3;
let screenOptions = ["stocks", "weather", "performance"];
function sendDataToKeyboard(msg) {
    if (!keyboard) {
        // Try to initiate a connection with the keyboard
        const devices = hid.devices();
        for (const d of devices) {
            if (d.product === "NIBBLE" && d.productId === 24672 && d.vendorId === 28257 && d.usage === usage && d.usagePage === usagePage) {
                keyboard = new hid.HID(d.path);
                console.log("Connection established.");

                // Log the data that the keyboard sends to the host
                keyboard.on('data', (e) => {
                    if (currentScreen != e[0]) {
                        currentScreen = e[0];
                        console.log(`Updating screen to ${screenOptions[e[0]-1]}`)

                        // Weather data and stock data don't query as often due to API
                        // constraints, so when the user switches to either of those
                        // screens, send the cached data right away.
                        if (currentScreen == 2) {
                            sendDataToKeyboard(weatherMsg);
                        } else if (currentScreen == 1) {
                            sendDataToKeyboard(stockMsg);
                        }
                    }
                    
                })

                // Initiate a new connection
                // 1st byte is thrown away (node-hid bug)
                // 2nd byte is used to initiate a new connection
                // The rest of the bytes can be discarded
                keyboard.write([0, 127, 1, 2, 3, 4, 5]);
                console.log("Sent init data.")
            }
        }
    }

    let currentScreenStatic = currentScreen;
    if (!(keyboard == null)) {
        try {
            for (let i = 0; i < 390; i=i+30) {
                let tmp = msg.slice(i, i+30);
                tmp.unshift(0, currentScreenStatic);
                wait(100);
                keyboard.write(tmp);
            }
        } catch(err) {
            console.log(err);
            console.log("Could not connect to keyboard. Will try again on next data transfer.");
            keyboard = null;
        }

    } else {
        console.log("No connection to keyboard");
    }
}

startPerfMonitor();
startWeatherMonitor();
startStockMonitor();
