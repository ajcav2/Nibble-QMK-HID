const hid = require('node-hid');
const fetch = require('node-fetch');
const request = require('request');
const { start } = require('repl');
// const fs = require('fs');
const aws = require('aws-sdk')
// import {plot, Plot} from 'nodeplotlib';

const productId = 24672;
const vendorId = 28257;

// (6, 1), (97, 65376), (128, 1), (6, 1), (1, 12)
const usage = 97;
const usagePage = 65376;

// AWS.config.update({region: 'us-east-1'})
aws.config.update({region: "us-east-1"});
let credentials = new aws.SharedIniFileCredentials({profile:'default'});
aws.config.credentials = credentials;

const devices = hid.devices();
for (const d of devices) {
    if (d.product === "NIBBLE" && d.productId === 24672 && d.vendorId === 28257 && d.usage === usage && d.usagePage === usagePage) {
        keyboard = new hid.HID(d.path);
        console.log("Connection established.");

        keyboard.on('data', (e) => {
            console.log(e);
        })


        keyboard.write([0, 1, 2, 4, 5]);
        console.log("Sent data.")
    }
}


function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

// let docClient = new aws.DynamoDB.DocumentClient();
// docClient.scan({TableName: "Stocks"}, onScan);
// function onScan(err, data) {
//     data.Items.forEach(function(itemdata) {
//         console.log(JSON.stringify(itemdata));
//     })
// }

// stocks = new Map();
// function getStocks() {
//     let docClient = new aws.DynamoDB.DocumentClient();
//     docClient.scan({TableName: "Stocks"}, onScan);
// };

// function onScan(err, data) {
//     if (err) console.log(err, err.stack);
//     data.Items.forEach(function(itemdata) {
//         if (!stocks.has(itemdata.Ticker)) {
//             stocks.set(itemdata.Ticker, new Map());
//         }
//         stocks.get(itemdata.Ticker).set(itemdata.Timestamp, itemdata.MarketPrice);
//         console.log(JSON.stringify(itemdata));
//     })
//     all_values = true;
// }

// getStocks();

async function startStockMonitor() {
    const stocks = new Map();
    let all_values = false;

    function getStocks() {
        let docClient = new aws.DynamoDB.DocumentClient();
        docClient.scan({TableName: "Stocks"}, onScan);
    };

    function onScan(err, data) {
        if (err) console.log(err, err.stack);
        data.Items.forEach(function(itemdata) {
            if (!stocks.has(itemdata.Ticker)) {
                stocks.set(itemdata.Ticker, new Map());
            }
            stocks.get(itemdata.Ticker).set(itemdata.Timestamp, itemdata.MarketPrice);
            console.log(JSON.stringify(itemdata));
        })
        all_values = true;
    }



    let counter = 0;
    while (true) {
        // await getStocks()
        // loop through all of the stocks, and send data to the keyboard, pausing for 15 sec after each one

        // if (counter % 10 === 0) {
        //     await getStocks();
        // }
        // counter++;
        getStocks();
        // while (!all_values) {
        //     await wait(2000);
        // }

        while (!all_values) {
            await wait(2000);
        }

        // await wait(2000);
        let thisStock = "NOC".padEnd(5);
        let priceWhole = 323;
        let priceWholeSmall = 323;
        let priceWholeBig = 323 >> 8;
        let priceFractional = 12;
        let pDiff = -4;
        pDiff = pDiff + 128;
        let topBottom = 1;
        let msg = [pDiff, priceWholeBig, priceWholeSmall, priceFractional, topBottom, thisStock.charCodeAt(0), thisStock.charCodeAt(1), thisStock.charCodeAt(2), thisStock.charCodeAt(3), thisStock.charCodeAt(4)];
        for (let i = 3; i < msg.length; i++) {
            if (msg[i] == 32) {
                msg[i] = 64;
            }
        }
        let pts = createStockLine(stocks.get('NOC'));
        for (let [x, y] of pts) {
            msg.push(x);
            msg.push(y);
        }
        while (msg.length < 390) {
            msg.push(0);
        }
        // const fs = require('fs');
        for (let i = 0; i < 390; i=i+30) {
            let tmp = msg.slice(i, i+30);
            tmp.unshift(0, 1);
            wait(100);
            keyboard.write(tmp);
        }
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

    // want Map {xval: yval}
    // need stockTimeSample --> xCoord

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
        if (stockPrice > highestStockPrice) {
            highestStockPrice = stockPrice;
        }
        if (stockPrice < lowestStockPrice) {
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
        // TODO: need to create scales to show Y value. maybe at 5%, 8%, 12%
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
    if (pt1.x > 128 || pt1.x < 0 || pt2.x > 128 || pt2.x < 0){
        console.log("bad x");
    }
    if (pt1.y > 32 || pt1.y < 0 || pt2.y < 0 || pt2.y > 32) {
        console.log("bad y");
    }
    let pts = new Map();
    pts.set(pt1.x, Math.round(pt1.y));
    pts.set(pt2.x, Math.round(pt2.y));
    let m = (pt2.y - pt1.y)/(pt2.x - pt1.x);
    for (let i = pt1.x; i < pt2.x; i++) {
        pts.set(i, Math.round(pt1.y - m*(pt1.x - i)));
    }
    return pts;
    
}


startStockMonitor();

// function get_ticker_data(ticker) {
//     fetch('https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&outputsize=full&apikey=8UMJCZFHBAVM9Z74')
//     .then(response => response.json())
//     .then(data => {
//         console.log(data);
//     })
//     .then(data => {
//         // console.log(data);
//         return data;
//     })
//     .catch(err => console.log(err));
// }

// let my_data = get_ticker_data("IBM");
// console.log(my_data);




// request('https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&outputsize=full&apikey=demo', { json: true }, (err, res, body) => {
//   if (err) { return console.log(err); }
//   console.log(body.url);
//   console.log(body.explanation);
// });


// fetch('https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&outputsize=full&apikey=demo')
//     .then(function(data) {
//         console.log(data.json());
//     })
//     .then(function(error) {
//         console.log("error");
//         console.log(error);
//     });

// async function get_ticker_data(ticker) {
//     let response = await fetch('https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&outputsize=full&apikey=demo');
//     let data = await response.json();
//     return data;
// }

// function to_graph(data) {
//     console.log(data);
// }

// to_graph(get_ticker_data("IBM"));

// async function startStockMonitor() {
//     const stocks = new Map();
//     let counter = 0;
//     stocks.set('MSFT', new Map());
//     stocks.set('TSLA', new Map());
//     stocks.set('GOOG', new Map());
//     stocks.set('FB', new Map());

//     function getStocks() {
//         const promises = [];
//         for (const [stock, stock_points] of stocks) {
//             promises.push(new Promise((resolve) => {
//                 request(`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${stock}&interval=5min&outputsize=full&apikey=8UMJCZFHBAVM9Z74`, (err, res, body) => {
//                     try {
//                         const step = res.toJSON();
//                         const data = JSON.parse(step['body'])
//                         for (const [time, value] of Object.entries(data["Time Series (5min)"])) {
//                             // TODO: Also check if the time is between maybe 7and 5pm
//                             if (!stock_points.has(time)) {
//                                 let d = new Date(time);
//                                 let today = new Date();
//                                 if (today.getDate() == d.getDate() && today.getMonth() == d.getMonth() && today.getYear() == d.getYear()) {
//                                     console.log(data["Time Series (5min)"][time])
//                                 }
//                                 if (d.getHours() < 16 && d.getHours() >= 9 && d.getDate() == today.getDate() && today.getYear() == d.getYear() && today.getMonth() == d.getMonth()) {
//                                     stock_points.set(time, data["Time Series (5min)"][time]["4. close"]);
//                                 }
//                             }
//                         }
//                     }
//                     catch(err) {
//                         console.log(err);
//                     }
                    
//                     resolve();
//                 })
//             }))
//         }

//         return Promise.all(promises);
//     };

//     while (true) {
//         // await getStocks()
//         // loop through all of the stocks, and send data to the keyboard, pausing for 15 sec after each one
//         if (counter % 10 === 0) {
//             await getStocks();
//         }
//         counter++;

//         await wait(2000);
//         let thisStock = "MSFT";
//         let msg = [thisStock.charCodeAt(0), thisStock.charCodeAt(1), thisStock.charCodeAt(2), thisStock.charCodeAt(3)];
//         let pts = createStockLine(stocks.get('MSFT'));
//         for (let [x, y] of pts) {
//             msg.push(x);
//             msg.push(y);
//         }
//         while (msg.length < 390) {
//             msg.push(0);
//         }
//         // const fs = require('fs');
//         for (let i = 0; i < 390; i=i+30) {
//             let tmp = msg.slice(i, i+30);
//             tmp.unshift(0, 1);
//             wait(100);
//             keyboard.write(tmp);
//         }
//     }
// }