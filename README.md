# Nibble-QMK-HID

A repository to utilize the OLED on the Nullbits Nibble board for real-time stock data, weather data, and PC component monitoring. Based on BlankSourceCode's [qmk-hid-display](https://github.com/BlankSourceCode/qmk-hid-display).

## Overview

This project utilizes QMK's raw hid methods to send and receive data between a host PC and a keyboard. The host PC runs a Node.js script which reaches out through various API's to gather data. The data is then encoded into a sequence of bytes, then sent to the keyboard where it is decoded. Right now, there are implementations to display stock data, weather data, and performance data on the OLED. See below on how to configure each type. 

## Installation

After cloning this repo, run `npm install .` and wait for all required packages to finish installing. You should also clone my fork of the Nibble library to get the OLED functionality working keyboard-side. You can see an example of how to implement this on [my keymap](https://github.com/ajcav2/nibble/blob/master/keymaps/hid-display/keymap.c).

## Configuration
There are just a few steps to get this feature working on your Nibble. First, choose a key to toggle between screens, and call the `update_oled()` method when this key is pressed. [Example here](https://github.com/ajcav2/nibble/blob/master/keymaps/hid-display/keymap.c). Make sure to change the following lines to reflect the data you plan on displaying.

```c
// Define which oled screens you want to see
#define show_stocks false
#define show_weather true
#define show_performance true

// Define which oled screen to start on
// 1: stocks   2: weather   3: performance
int volatile current_screen = 2;
```

Next, set up your [config file](https://github.com/ajcav2/Nibble-QMK-HID/blob/master/config.js) according to the table below.
| Parameter | Default value | Description |
|-----------|:-------------:|-------------|
| `productId` |  `24672` | Nibble product ID |
| `vendorId` |    `28257`   | Nibble vendor ID |
| `usage` | `97` | Nibble usage |
| `usagePage` |  `65376` | Nibble usage page |
| `showStocks` |    `false`   | Should we load the stocks page? |
| `tableName` | `'Stocks'` | If showing stocks, provide the AWS table name |
| `region` |  `'us-east-1'` | If showing stocks, provide the AWS region |
| `profile` |    `'default'`   | If showing stocks, provide the AWS profile |
| `showWeather` | `true` | Should we load the weather? |
| `weatherApiKey` |  `null` | If showing weather, provide an API key for OpenWeatherMap |
| `zipCode` |    `60005`   | If showing weather, provide a zip code |
| `showPerformance` | `true` | Should we show system performance? |
| `storageDrive` | `'C:'` | If showing performance, provide a storage drive letter |

Finally, if you choose to use stock data, you will need to configure your own AWS DynamoDB table and Lambda function to pull and record stock data. If you're up to the challenge, feel free to reach out to me and I can provide a Lambda file that scrapes the stock data and puts it into a table. Lastly, follow the steps [here](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html#setup-credentials-setting) to set your credentials on your windows machine. This has not been tested on Linux or Mac.

## Stock Data

![Stock screen](./img/stocks.jpg)
Unfortuately, real time stock data is not free to obtain or store, so this part of the project requires a bit more effort to implement. As a workaround, I created a Python script to run every 5 minutes on AWS Lambda which scrapes Yahoo Finance for real-time stock data on specfic companies. This data is then sent to a DynamoDB table for storage. When the main `Keyboard.js` script is running, it queries the DynamoDB table for stock information. The keys in the DynamoDB table are: `Ticker`, `Timestamp`, and `MarketPrice`.

Once the data is sorted, some key metrics are sent to the keyboard. We start by sending the stock's current price, as well as percent change from beginning of the trading day. We also send the name of the stock. Lastly, we send a list of (x, y) coordinates which represent the graph of the stock's market price throughout the day. This information is decoded on the keyboard, and the relevant information is drawn.

## Weather Data

![Weather screen](./img/weather.jpg)
Weather data is obtained from [OpenWeatherMap](https://openweathermap.org/). To use this feature, you must request an API key [here](https://openweathermap.org/appid). Once you have your API key, copy it into `config.js`. This is also where you will set your zip code for the weather data. 

## Performance Data

![Performance screen](./img/performance.jpg)
Currently, the performance data module will monitor four aspects of your PC: current volume, CPU utilization, RAM utilization, and disk space utilization on the C: drive, or another drive of your choice. 

