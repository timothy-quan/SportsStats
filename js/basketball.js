
const { RateLimit } = require('async-sema');
const math = require('mathjs');

let api_url_players = "https://www.balldontlie.io/api/v1/players?per_page=100";
let api_url_averages = "https://www.balldontlie.io/api/v1/season_averages?season=";
let tab =
    `<tr>
      <th>Rank</th>
      <th>Name</th>
      <th>Pos</th>
      <th>Team</th>
      <th>Gp</th>
      <th>Min</th>
      <th>Pts</th>
      <th>Ast</th>
      <th>Reb</th>
      <th>3PM</th>
      <th>Blk</th>
      <th>Stl</th>
      <th>Fgm</th>
      <th>Fga</th>
      <th>Fg %</th>
      <th>Ftm</th>
      <th>Fta</th>
      <th>Ft %</th>
      <th>To</th>
      <th>Rating</th>
     </tr>`;

// Creates drop-down menu of NBA seasons
 let years = document.getElementById("years");
 let currentYear = new Date().getFullYear();
 let firstYear = 1983;
 while (currentYear >= firstYear) {
     let yearOption = document.createElement("option");
     yearOption.text =  currentYear + " - " + (currentYear + 1);
     yearOption.value = currentYear;
     years.add(yearOption);
     currentYear--;
 }

let controller = new AbortController();
let signal = controller.signal;
let search;
let timer;

// Removes all players from the table
function resetTable() {
tab =
    `<tr>
      <th>Rank</th>
      <th>Name</th>
      <th>Pos</th>
      <th>Team</th>
      <th>Gp</th>
      <th>Min</th>
      <th>Pts</th>
      <th>Ast</th>
      <th>Reb</th>
      <th>3PM</th>
      <th>Blk</th>
      <th>Stl</th>
      <th>Fgm</th>
      <th>Fga</th>
      <th>Fg %</th>
      <th>Ftm</th>
      <th>Fta</th>
      <th>Ft %</th>
      <th>To</th>
      <th>Rating</th>
     </tr>`;
}

// Return number of pages from players endpoint, gets total number of players
async function getTotalPages(playersUrl) {
    let response = await fetch(playersUrl, {signal});
    var stats = await response.json();
    return JSON.parse(stats.meta.total_pages);
}

// Returns all players from the API in an array
async function getApi(playersUrl) {
    let pages = await getTotalPages(playersUrl);
    const limit = RateLimit(1);
    let players = [];
    for (var i = 1; i <= pages; i++) {
        var modifiedUrl = playersUrl + "&page=" + i;
        let response = await fetch(modifiedUrl, {signal});
        var stats = await response.json();
        getPlayers(stats, players);
        await limit();
    }
    return players;
}

// Gets the player ID, full name, position and team of each player
function getPlayers(stats, players) {
    for (let r of stats.data) {
        players.push({id:r.id, firstName:r.first_name, lastName:r.last_name, position:r.position, team:r.team.abbreviation});
    }
}

// Returns stats for each player based on the chosen season
async function getAveragesApi(playersUrl, averagesUrl) {
    hideSearchReset();
    showLoader();
    let players = await getApi(playersUrl);
    const numOfPlayers = players.length;
    const limit = RateLimit(1);

    var modifiedUrl = averagesUrl + document.getElementById("years").value;

    var count = 0;
    while (count < numOfPlayers) {
        for (x = 0; x < 250; x++) {
            modifiedUrl += "&player_ids[]=" + players[count].id;
            count++;
            if (count == numOfPlayers) {
                break;
            }
        }
        let response = await fetch(modifiedUrl, {signal});
        var stats = await response.json();
        console.log(stats);
        for (let s of stats.data) {
            let player = players.find(obj => {
                return obj.id === s.player_id;
            })
            player.gamesPlayed = s.games_played;
            player.minutes = s.min;
            player.points = s.pts;
            player.assists = s.ast;
            player.rebounds = s.reb;
            player.threePointers = s.fg3m;
            player.blocks = s.blk;
            player.steals = s.stl;
            player.fgMade = s.fgm;
            player.fgAttempts = s.fga;
            player.fgPercent = s.fg_pct;
            player.ftMade = s.ftm;
            player.ftAttempts = s.fta;
            player.ftPercent = s.ft_pct;
            player.turnovers = s.turnover;
            player.rating = 0;
        }
        await limit();
        modifiedUrl = averagesUrl + document.getElementById("years").value;
    }
    removePlayers(players);
    createFgFtWeighting(players);
    console.log(players);
    createRating(players);
    replaceNull(players);
    sortByRating(players);
    hideLoader();
    stopMusic();
    showTable();
    showSearchReset();
}

// Removes players that have no games played during the chosen season
function removePlayers(players) {
    for (var i = 0; i < players.length; i++) {
        if (players[i].gamesPlayed === undefined) {
            players.splice(i, 1);
            i--;
        }
    }
}

// Creates a fg% and ft% weighting based on the number of free throws and field goals attempted
function createFgFtWeighting(players) {
    let fgPercentages = players.map(a => a.fgPercent);
    let ftPercentages = players.map(a => a.ftPercent);
    const fgAverage = math.mean(fgPercentages);
    const ftAverage = math.mean(ftPercentages);
    for (let r of players) {
        let fgDifference = r.fgPercent - fgAverage;
        r.fgWeighting = fgDifference * r.fgAttempts;
        let ftDifference = r.ftPercent - ftAverage;
        r.ftWeighting = ftDifference * r.ftAttempts;
    }
}

// Create overall Z-score rating for each player by adding up the Z-scores for each chosen category
function createRating(players) {
    let selected = [];
    for (var option of document.getElementById("categories").options) {
        if (option.selected) {
            selected.push(option.value);
        }
    }
    for (let category of selected) {
        let categoryArray = [];
        if (category === "fgPercent") {
            categoryArray = players.map(a => a.fgWeighting);
        } else if (category === "ftPercent") {
            categoryArray = players.map(a => a.ftWeighting);
        } else {
            categoryArray = players.map(a => a[category]);
        }
        categoryArray = categoryArray.filter(x => x !== null);
        const mean = math.mean(categoryArray);
        const std = math.std(categoryArray);
        for (let r of players) {
            let zScore = 0;
            if (category === "fgPercent") {
                zScore = (r.fgWeighting - mean) / std;
            } else if (category === "ftPercent") {
                zScore = (r.ftWeighting - mean) / std;
            } else {
                zScore = (r[category] - mean) / std;
            }
            if (category === "turnovers") {
                r.rating -= zScore;
            } else {
                r.rating += zScore;
            }
        }
    }
    for (let r of players) {
        r.rating = r.rating.toFixed(2);
    }
}

// Replace null properties with N/A for table view
function replaceNull(players) {
    for (let r of players) {
        for (var category in r) {
            if (r[category] == null) {
                r[category] = "N/A";
            }
        }
    }
}

// Sorts players by their overall Z-score rating and creates ranking table
function sortByRating(players) {
    players.sort(function(a, b){return b.rating - a.rating});
    let rank = 1;
    for (let r of players) {
        tab +=
            `<tr>
                <td>${rank}</td>
                <td>${r.firstName} ${r.lastName}</td>
                <td>${r.position}</td>
                <td>${r.team}</td>
                <td>${r.gamesPlayed}</td>
                <td>${r.minutes}</td>
                <td>${r.points}</td>
                <td>${r.assists}</td>
                <td>${r.rebounds}</td>
                <td>${r.threePointers}</td>
                <td>${r.blocks}</td>
                <td>${r.steals}</td>
                <td>${r.fgMade}</td>
                <td>${r.fgAttempts}</td>
                <td>${r.fgPercent}</td>
                <td>${r.ftMade}</td>
                <td>${r.ftAttempts}</td>
                <td>${r.ftPercent}</td>
                <td>${r.turnovers}</td>
                <td>${r.rating}</td>
            </tr>`;
        rank++;
    }

    document.getElementById("players").innerHTML = tab;
}

// The showLoader() function to the stopMusic() function are functions that show or hide certain features during loading of stats
function showLoader() {
    document.getElementById("loading").style.display = "inline-block";
}

function hideLoader() {
    document.getElementById("loading").style.display = "none";
}

function hideTable() {
    document.getElementById("players").style.display = "none";
}

function showTable() {
    document.getElementById("players").style.display = "table";
}

function hideSearchReset() {
    document.getElementById("search").style.display = "none";
    document.getElementById("reset").style.display = "none";
    document.getElementById("dunkanimation").style.display = "inline-block";
}

function showSearchReset() {
    document.getElementById("search").style.display = "inline-block";
    document.getElementById("reset").style.display = "inline-block";
    document.getElementById("dunkanimation").style.display = "none";
}

function playMusic() {
    document.getElementById("loadingmusic").play();
}

function stopMusic() {
    document.getElementById("loadingmusic").pause();
}

// Aborts the current API request and resets user inputs
function resetSearch() {
    controller.abort();
    controller = new AbortController();
    signal = controller.signal;
    hideLoader();
    stopMusic();
    hideTable();
    document.getElementById("categories").selectedIndex = -1;
    document.getElementById("years").selectedIndex = 0;
}

// Creates a countdown timer so that users can abort the search before the API request is actually sent (loading stats takes some time)
function countdownTimer() {
    var remainingTime = 5;
    timer = setInterval(function(){
        document.getElementById("timer").style.display = "inline-block";
        if(remainingTime <= 0){
            document.getElementById("timer").style.display = "none";
            clearInterval(timer);
        } else {
            document.getElementById("timer").innerHTML = remainingTime;
        }
        remainingTime -= 1;
    }, 1000);
}

// Validates that at least a single category is selected
var validate = function () {
    var usrInput = document.getElementById("categories").value;
    var errMsg = document.getElementById("alertPlaceholder");
    var isValid = true;

    if (usrInput == "") {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = '<div class="alert alert-danger alert-trim" role="alert">' +
                            '<svg class="bi flex-shrink-0 me-2" width="24" height="24" role="img" aria-label="Danger:"><use xlink:href="#exclamation-triangle-fill"/></svg>' +
                            '<div>' + "No categories selected!" + '</div><button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>';
        alertPlaceholder.append(wrapper);
        isValid = false;
    }

    return isValid;

};

document.getElementById("search").onclick = function () {
    if (validate()) {
        hideTable();
        playMusic();
        resetTable();
        setTimeout(function(){ countdownTimer() }, 0000);
        search = setTimeout(function(){ getAveragesApi(api_url_players, api_url_averages) }, 6000);
    }
};

document.getElementById("reset").onclick = function () {
    clearTimeout(search);
    document.getElementById("timer").style.display = "none";
    clearInterval(timer);
    resetSearch();
};
