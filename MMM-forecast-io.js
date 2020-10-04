Module.register("MMM-forecast-io", {

    defaults: {
        apiKey: "",
        apiBase: "https://api.darksky.net/forecast",
        units: config.units,
        language: config.language,
        showIndoorTemperature: false,
        updateInterval: 10 * 60 * 1000, // every 5 minutes
        animationSpeed: 1000,
        initialLoadDelay: 0, // 0 seconds delay
        retryDelay: 2500,
        tempDecimalPlaces: 0, // round temperatures to this many decimal places
        geoLocationOptions: {
            enableHighAccuracy: true,
            timeout: 5000
        },
        latitude: null,
        longitude: null,
        showForecast: true,
        forecastTableFontSize: 'medium',
        maxDaysForecast: 7,   // maximum number of days to show in forecast
        showWind: true,
        showSunriseSunset: true,
        enablePrecipitationGraph: false,
        alwaysShowPrecipitationGraph: false,
        showDailyPrecipitationChance: true,
        showWarningOnly: false,
        precipitationGraphWidth: 400,
        precipitationFillColor: 'white',
        precipitationProbabilityThreshold: 0.1,
        precipitationIntensityScaleTop: 0.2,
        unitTable: {
            'default': 'auto',
            'metric': 'si',
            'imperial': 'us'
        },
        iconTable: {
            'clear-day': 'wi-day-sunny',
            'clear-night': 'wi-night-clear',
            'rain': 'wi-rain',
            'snow': 'wi-snow',
            'sleet': 'wi-rain-mix',
            'wind': 'wi-cloudy-gusts',
            'fog': 'wi-fog',
            'cloudy': 'wi-cloudy',
            'partly-cloudy-day': 'wi-day-cloudy',
            'partly-cloudy-night': 'wi-night-cloudy',
            'hail': 'wi-hail',
            'thunderstorm': 'wi-thunderstorm',
            'tornado': 'wi-tornado'
        },
        debug: false
    },

    getTranslations: function () {
        return false;
    },

    getScripts: function () {
        return [
            'jsonp.js',
            'moment.js'
        ];
    },

    getStyles: function () {
        return ["font-awesome.css", "weather-icons.css", "weather-icons-wind.css", "MMM-forecast-io.css"];
    },

    shouldLookupGeolocation: function () {
        return this.config.latitude == null &&
            this.config.longitude == null;
    },

    start: function () {
        Log.info("Starting module: " + this.name);

        // Clear local Storage 
        //this.removeData(); - Temp leave will remove when final release is out. 

        // still accept the old config
        if (this.config.hasOwnProperty("showPrecipitationGraph")) {
            this.config.enablePrecipitationGraph = this.config.showPrecipitationGraph;
        }

        if (this.shouldLookupGeolocation()) {
            this.getLocation();
        }
        this.scheduleUpdate(this.config.initialLoadDelay);
    },

    updateWeather: function () {
        if (this.geoLocationLookupFailed) {
            return;
        }
        if (this.shouldLookupGeolocation() && !this.geoLocationLookupSuccess) {
            this.scheduleUpdate(1000); // try again in one second
            return;
        }

        var units = this.config.unitTable[this.config.units] || 'auto';

        // Begin Nighthawk70 add -- 

        // This code checks to see if data is already stored in Localstorage.  
        // If so, then we get the current date and time from the JSON data, 
        //  compare it to the current date and time.  
        // If the difference in milliseconds between the two dates and times, 
        //  is greater than the updateInterval value, then it will fetch the 
        //  new data from darksky API. 
        //  Else it will use the stored data to stop a duplicate, unnessary call
        //  and ultimately add an additional call to your API call count. 

        var updateDataFromSource = true;
        // Check local storage
        var storedData = this.loadData();

        // detect if we have data.. and for some reason the location changed. 
        if (storedData !== false && storedData.latitude == this.config.latitude) {
            var storedWeatherDateTime = new Date(storedData.currently.time * 1000);
            var currentTime = new Date();
            var diff = (currentTime - storedWeatherDateTime); // Difference in milliseconds.

            if (this.config.debug) {
                console.log("Storage weather time: = " + new Date(currentTime));
                console.log("Time difference in milliseconds = " + diff);
                console.log("updateInterval = " + this.config.updateInterval);
            }

            // if the difference in milliseconds is less than the updateInterval milliseond value
            //  do not update from the API, use what we have stored. 
            if (diff < this.config.updateInterval) {
                if (this.config.debug) console.log("======> DO NOT update data, use stored data");
                updateDataFromSource = false;
            } else {
                if (this.config.debug) console.log("=====> UPDATE DATA from DarkSky");
            }
        }
               

        if (updateDataFromSource) {
            // existing code.. 
            var url = this.config.apiBase + '/' + this.config.apiKey + '/' + this.config.latitude + ',' + this.config.longitude + '?units=' + units + '&lang=' + this.config.language;
            if (this.config.data) {
                // for debugging
                this.processWeather(this.config.data);
            } else {
                getJSONP(url, this.processWeather.bind(this), this.processWeatherError.bind(this));
            }
            // end existing code..
        } else {
            // Use the stored data from localStorage and process
            if (this.config.data) console.log(">>> Using stored data from localstorage...");
            this.processWeather.bind(storedData);
        }
    },

    processWeather: function (data) {
        if (this.config.debug) {
            console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
            console.log('weather data', data);
            console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        }

        // Nighthawk70 Add - Save data to local storage to cache it.
        this.saveData(data);

        this.loaded = true;
        this.weatherData = data;
        this.temp = this.roundTemp(this.weatherData.currently.temperature);
        this.updateDom(this.config.animationSpeed);
        this.scheduleUpdate();
    },

    processWeatherError: function (error) {
        if (this.config.debug) {
            console.log('process weather error', error);
        }

        // Nighthawk70 Add -- Just in case clear the cache.
        this.removeData();

        // try later
        this.scheduleUpdate();
    },

    notificationReceived: function (notification, payload, sender) {
        switch (notification) {
            case "DOM_OBJECTS_CREATED":
                break;
            case "INDOOR_TEMPERATURE":
                if (this.config.showIndoorTemperature) {
                    this.roomTemperature = payload;
                    this.updateDom(this.config.animationSpeed);
                }
                break;
        }
    },

    getDom: function () {
        var wrapper = document.createElement("div");

        if (this.config.apiKey === "") {
            wrapper.innerHTML = "Please set the correct forcast.io <i>apiKey</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.geoLocationLookupFailed) {
            wrapper.innerHTML = "Geolocaiton lookup failed, please set <i>latitude</i> and <i>longitude</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = this.translate('LOADING');
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        // show warning only.. 
        if (this.config.showWarningOnly) {

            this.renderWarningBanner(wrapper);
            return wrapper;

        } else {
            // normal code.. 
            var currentWeather = this.weatherData.currently;
            var daily = this.weatherData.daily;
            var hourly = this.weatherData.hourly;
            var minutely = this.weatherData.minutely;

            var large = document.createElement("div");
            large.className = "large light";

            //========== Current Weather

            var icon = currentWeather ? currentWeather.icon : hourly.icon;
            var iconClass = this.config.iconTable[icon];
            var icon = document.createElement("span");
            icon.className = 'big-icon wi ' + iconClass;
            large.appendChild(icon);

            var temperature = document.createElement("span");
            temperature.className = "bright";
            temperature.innerHTML = " " + this.temp + "&deg;" + " ";
            large.appendChild(temperature);

            //========== Feels Like Temp

            var feelsLike = document.createElement("span");
            feelsLike.className = "small normal";
            feelsLike.innerHTML = "Feels Like: ";
            large.appendChild(feelsLike);

            var feelsLike = document.createElement("span");
            feelsLike.className = "mlarge normal";
            feelsLike.innerHTML = " " + Math.round(currentWeather.apparentTemperature) + "&deg;";
            large.appendChild(feelsLike);

            //========== Wind

            var wind = document.createElement("div");
            wind.className = "small dimmed wind";

            var windBearing = document.createElement("span");
            windBearing.className = "wi wi-wind from-" + Math.round(currentWeather.windBearing) + "-deg";
            wind.appendChild(windBearing);

            var cardinalDirection = this.translate(this.degreeToCardinal(currentWeather.windBearing));

            var windSpeed = document.createElement("span");
            if (this.config.units === 'metric') {
                var windSpeedUnit = "m/s";
            } else {
                var windSpeedUnit = "mph";
            }

            windSpeed.innerHTML = " " + cardinalDirection + " " + Math.round(currentWeather.windSpeed) + "-" + Math.round(currentWeather.windGust) + windSpeedUnit;
            wind.appendChild(windSpeed);

            //========== Humidity and Dew Point

            var humidityDew = document.createElement("div");
            humidityDew.className = "small dimmed humidity-dew-point";

            var dewPointIcon = document.createElement("span");
            dewPointIcon.className = "Dew Point: ";
            humidityDew.appendChild(dewPointIcon);

            var dewPoint = document.createElement("span");
            dewPoint.innerHTML = "Dew Point: " + Math.round(currentWeather.dewPoint) + "&deg;";
            humidityDew.appendChild(dewPoint);

            var humidityIcon = document.createElement("span");
            humidityIcon.className = " wi wi-humidity ";
            humidityDew.appendChild(humidityIcon);

            var humidity = document.createElement("span");
            humidity.innerHTML = "Humidity: " + Math.round(this.weatherData.currently.humidity * 100) + "%";
            humidityDew.appendChild(humidity);

            //========= Sunrise/Sunset/Day Length    

            var sunriseSunset = document.createElement("div");
            sunriseSunset.className = "small dimmed sunrise-sunset";

            var daylightTotal = document.createElement("span");
            daylightTotal.innerHTML = "Day Length: " + moment.utc(moment(daily.data[0].sunsetTime).diff(moment(daily.data[0].sunriseTime)) * 1000).format("HH:mm") + " ";
            sunriseSunset.appendChild(daylightTotal);

            var sunriseIcon = document.createElement("span");
            sunriseIcon.className = "wi wi-sunrise";
            sunriseSunset.appendChild(sunriseIcon);

            var sunriseTime = document.createElement("span");
            sunriseTime.innerHTML = moment(new Date(daily.data[0].sunriseTime * 1000)).format("LT") + "&nbsp;";
            sunriseSunset.appendChild(sunriseTime);

            var sunsetIcon = document.createElement("span");
            sunsetIcon.className = "wi wi-sunset";
            sunriseSunset.appendChild(sunsetIcon);

            var sunsetTime = document.createElement("span");
            sunsetTime.innerHTML = moment(new Date(daily.data[0].sunsetTime * 1000)).format("LT") + " ";
            sunriseSunset.appendChild(sunsetTime);

            //========== Weather Alerts

            var weatherAlerts = document.createElement("div");
            weatherAlerts.className = "small bright weather-alert";

            if (this.weatherData.alerts !== undefined) {

                var warningIcon = document.createElement("span");
                warningIcon.className = "fas fa-exclamation-triangle";
                weatherAlerts.appendChild(warningIcon);

                var alert = document.createElement("span");
                alert.innerHTML = " " + this.weatherData.alerts[0].title + "<br>" + "<b>Start:</b> " + moment(new Date(this.weatherData.alerts[0].time * 1000)).format("MMM DD hh:mm A") + " | <b>End:</b> " + moment(new Date(this.weatherData.alerts[0].expires * 1000)).format("MMM DD hh:mm A")/* + "<br>" + this.weatherData.alerts[0].description*/;
                weatherAlerts.appendChild(alert);
            }

            //========== Weather Summary

            wrapper.appendChild(weatherAlerts);

            var summaryText = this.weatherData.minutely.summary + " " + this.weatherData.hourly.summary + " " + this.weatherData.daily.summary;
            var summary = document.createElement("div");
            summary.className = "small dimmed summary";
            summary.innerHTML = summaryText;

            wrapper.appendChild(summary);
            wrapper.appendChild(large);

            if (this.config.showWind) {
                wrapper.appendChild(wind);
            }

            wrapper.appendChild(humidityDew);

            if (this.config.showSunriseSunset) {
                wrapper.appendChild(sunriseSunset);
            }

            if (this.config.alwaysShowPrecipitationGraph ||
                (this.config.enablePrecipitationGraph &&
                    this.isAnyPrecipitation(minutely))) {
                wrapper.appendChild(this.renderPrecipitationGraph());
            }

            if (this.config.showForecast) {
                wrapper.appendChild(this.renderWeatherForecast());
            }
        } // end not only show warnings.. 

        return wrapper;
    },

    isAnyPrecipitation: function (minutely) {
        if (!minutely) {
            return false;
        }
        var data = this.weatherData.minutely.data;
        var threshold = this.config.precipitationProbabilityThreshold;
        for (i = 0; i < data.length; i++) {
            if (data[i].precipProbability > threshold) {
                return true;
            }
        }
        return false;
    },

    // =====================Precipitation Graph

    renderPrecipitationGraph: function () {
        var i;
        var width = this.config.precipitationGraphWidth;
        var height = Math.round(width * 0.25);
        var element = document.createElement('canvas');
        element.className = "precipitation-graph";
        element.width = width;
        element.height = height;
        var context = element.getContext('2d');

        var sixth = Math.round(width / 6);
        context.save();
        context.strokeStyle = 'gray';
        context.lineWidth = 2;
        for (i = 1; i < 6; i++) {
            context.moveTo(i * sixth, height);
            context.lineTo(i * sixth, height - 10);
            context.stroke();
        }
        context.restore();

        var third = Math.round(height / 3);
        context.save();
        context.strokeStyle = 'gray';
        context.setLineDash([5, 15]);
        context.lineWidth = 1;
        for (i = 1; i < 3; i++) {
            context.moveTo(0, i * third);
            context.lineTo(width, i * third);
            context.stroke();
        }
        context.restore();

        var data = this.weatherData.minutely.data;
        var stepSize = Math.round(width / data.length);
        context.save();
        context.strokeStyle = 'white';
        context.fillStyle = this.config.precipitationFillColor;
        context.globalCompositeOperation = 'xor';
        context.beginPath();
        context.moveTo(0, height);
        var threshold = this.config.precipitationProbabilityThreshold;
        var intensity;

        // figure out how we're going to scale our graph
        var maxIntensity = 0;
        for (i = 0; i < data.length; i++) {
            maxIntensity = Math.max(maxIntensity, data[i].precipIntensity);
        }
        // if current intensity is above our normal scale top, make that the top
        if (maxIntensity < this.config.precipitationIntensityScaleTop) {
            maxIntensity = this.config.precipitationIntensityScaleTop;
        }

        for (i = 0; i < data.length; i++) {
            if (data[i].precipProbability < threshold) {
                intensity = 0;
            } else {
                intensity = height * (data[i].precipIntensity / maxIntensity);
            }
            context.lineTo(i * stepSize, height - intensity);
        }
        context.lineTo(width, height);
        context.closePath();
        context.fill();
        context.restore();

        return element;
    },

    getDayFromTime: function (time) {
        var dt = new Date(time * 1000);
        return moment.weekdaysShort(dt.getDay());
    },

    renderForecastRow: function (data, min, max) {
        var total = max - min;
        var interval = 100 / total;
        var rowMinTemp = this.roundTemp(data.temperatureMin);
        var rowMaxTemp = this.roundTemp(data.temperatureMax);

        var row = document.createElement("tr");
        row.className = "forecast-row";

        var dayTextSpan = document.createElement("span");
        dayTextSpan.className = "forecast-day"
        dayTextSpan.innerHTML = this.getDayFromTime(data.time);
        var iconClass = this.config.iconTable[data.icon];
        var icon = document.createElement("span");
        icon.className = 'wi weathericon ' + iconClass;

        var dayPrecipProb = document.createElement("span");
        dayPrecipProb.className = "forecast-precip-prob";
        if (data.precipProbability > 0) {
            dayPrecipProb.innerHTML = Math.round(data.precipProbability * 100) + "%";
        } else {
            dayPrecipProb.innerHTML = "&nbsp;";
        }

        var forecastBar = document.createElement("div");
        forecastBar.className = "forecast-bar";

        var minTemp = document.createElement("span");
        minTemp.innerHTML = rowMinTemp + "&deg;";
        minTemp.className = "temp min-temp";

        var maxTemp = document.createElement("span");
        maxTemp.innerHTML = rowMaxTemp + "&deg;";
        maxTemp.className = "temp max-temp";

        var bar = document.createElement("span");
        bar.className = "bar";
        bar.innerHTML = "&nbsp;";
        var barWidth = Math.round(interval * (rowMaxTemp - rowMinTemp));
        bar.style.width = barWidth + '%';

        var leftSpacer = document.createElement("span");
        leftSpacer.style.width = (interval * (rowMinTemp - min)) + "%";
        var rightSpacer = document.createElement("span");
        rightSpacer.style.width = (interval * (max - rowMaxTemp)) + "%";

        forecastBar.appendChild(leftSpacer);
        forecastBar.appendChild(minTemp);
        forecastBar.appendChild(bar);
        forecastBar.appendChild(maxTemp);
        forecastBar.appendChild(rightSpacer);

        var forecastBarWrapper = document.createElement("td");
        forecastBarWrapper.appendChild(forecastBar);

        row.appendChild(dayTextSpan);
        row.appendChild(icon);
        if (this.config.showDailyPrecipitationChance) {
            row.appendChild(dayPrecipProb);
        }
        row.appendChild(forecastBarWrapper);

        return row;
    },

    renderWeatherForecast: function () {
        var numDays = this.config.maxDaysForecast;
        var i;

        var filteredDays =
            this.weatherData.daily.data.filter(function (d, i) { return (i < numDays); });

        var min = Number.MAX_VALUE;
        var max = -Number.MAX_VALUE;
        for (i = 0; i < filteredDays.length; i++) {
            var day = filteredDays[i];
            min = Math.min(min, day.temperatureMin);
            max = Math.max(max, day.temperatureMax);
        }
        min = Math.round(min);
        max = Math.round(max);

        var display = document.createElement("table");
        display.className = this.config.forecastTableFontSize + " forecast";
        for (i = 0; i < filteredDays.length; i++) {
            var day = filteredDays[i];
            var row = this.renderForecastRow(day, min, max);
            display.appendChild(row);
        }
        return display;
    },

    getLocation: function () {
        var self = this;
        navigator.geolocation.getCurrentPosition(
            function (location) {
                if (self.config.debug) {
                    console.log("geolocation success", location);
                }
                self.config.latitude = location.coords.latitude;
                self.config.longitude = location.coords.longitude;
                self.geoLocationLookupSuccess = true;
            },
            function (error) {
                if (self.config.debug) {
                    console.log("geolocation error", error);
                }
                self.geoLocationLookupFailed = true;
                self.updateDom(self.config.animationSpeed);
            },
            this.config.geoLocationOptions);
    },

    // Round the temperature based on tempDecimalPlaces
    roundTemp: function (temp) {
        var scalar = 1 << this.config.tempDecimalPlaces;

        temp *= scalar;
        temp = Math.round(temp);
        temp /= scalar;

        return temp;
    },

    // convert windBearing (which is technically a heading) into cardinal direction
    degreeToCardinal: function (degree) {
        // N repeated 2nd time for easier calculation of degrees between 348.75 and 359.99
        var cardinalDirections = ['N', 'NNE', 'NE', 'ENE',
            'E', 'ESE', 'SE', 'SSE',
            'S', 'SSW', 'SW', 'WSW',
            'W', 'WNW', 'NW', 'NNW',
            'N'];
        var index = Math.trunc((degree + 11.25) / 22.5);

        return cardinalDirections[index];
    },

    scheduleUpdate: function (delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        var self = this;
        setTimeout(function () {
            self.updateWeather();
        }, nextLoad);
    },

    // Nighthawk70 - Additions and Modifications below --------------------------------------

    // Notes:  
    //   renderWarningBanner method: 
    //     Added new method to write the alert banner in the area of the screen the user defines. 
    //     Originally intended for the middle of the screen, but will test other areas
    //
    //   load and save methods: 
    //     I added the ability to call just this entire module to show a warning banner, 
    //     I wanted to be able to have the module added to another area on the Magic Mirror without
    //     the cost of calling the API again.  
    //     Storing the JSON data for the time interval is sufficient for now.. testing is commencing. 

    // render a full width banner for warnings. Something that grabs attention
    renderWarningBanner: function (wrapper) {
        // If there are weather alerts.. 
        if (this.weatherData.alerts !== undefined) {
            var weatherAlerts = document.createElement("div");
            weatherAlerts.className = "mlarge bright weather-alert-banner";

            var warningIcon = document.createElement("span");
            warningIcon.className = "fas fa-exclamation-triangle";
            weatherAlerts.appendChild(warningIcon);

            var alert = document.createElement("span");
            alert.innerHTML = " " + this.weatherData.alerts[0].title + "<br>" + "<b>Start:</b> " + moment(new Date(this.weatherData.alerts[0].time * 1000)).format("MMM DD hh:mm A") + " | <b>End:</b> " + moment(new Date(this.weatherData.alerts[0].expires * 1000)).format("MMM DD hh:mm A")/* + "<br>" + this.weatherData.alerts[0].description*/;
            weatherAlerts.appendChild(alert);
            wrapper.appendChild(weatherAlerts);
        }
    },

    // Load JSON weather data from Localstorage to save a round trip to weather service
    loadData: function () {
        if (window.localStorage.getItem("WeatherForeCastIO")) {
            return JSON.parse(window.localStorage.getItem("WeatherForeCastIO"));
        } else {
            return false;
        }
    },

    // Load JSON weather data from Localstorage to save a round trip to weather service
    saveData: function (weatherData) {
        window.localStorage.setItem("WeatherForeCastIO", JSON.stringify(weatherData));
    },

    removeData: function () {
        window.localStorage.removeItem("WeatherForeCastIO");
    }
    // End Nighthawk70 Add.. 

});
