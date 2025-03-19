import React from 'react';
import './SummonerSearch.css';
import { makeObservable, observable, action } from 'mobx';
import { observer } from 'mobx-react';
import { Link } from 'react-router-dom';
import Bottleneck from 'bottleneck';


const limiter = new Bottleneck({
    reservoir: 100, // Allow 100 requests per cycle
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 2 * 60 * 1000, // Every 2 minutes
    maxConcurrent: 5, // 🔽 Reduce concurrent requests
});


const fetchWithLimiter = limiter.wrap(async (url: string, options: RequestInit) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorDetails = await response.text(); // Get the error message from the response
            console.error(`API request failed: ${response.status} - ${errorDetails}`);
            throw new Error(`API request failed: ${response.status} - ${errorDetails}`);
        }
        return response.json();
    } catch (error) {
        console.error('Error in fetchWithLimiter:', error);
        throw error;
    }
});

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetchWithLimiter(url, options);
            return response;
        } catch (error: any) {
            if (error.message.includes('429')) {
                const waitTime = delay * Math.pow(2, i); // Exponential Backoff (1s, 2s, 4s...)
                console.warn(`Rate limit hit. Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else if (i === retries - 1) {
                throw error; // Throw error if all retries fail
            }
        }
    }
};

const playerCache: Record<string, any> = {}; // Store fetched Riot ID data

const fetchRiotID = async (puuid: string, apiKey: string) => {
    if (playerCache[puuid]) return playerCache[puuid]; // Return cached data

    const accountData = await fetchWithRetry(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': apiKey } }
    );

    playerCache[puuid] = accountData; // Cache the result
    return accountData;
};

const getItemImageUrl = (itemId: number) => {
    // Use the item ID to generate the URL for the item's image
    return `https://ddragon.leagueoflegends.com/cdn/15.6.1/img/item/${itemId}.png`;

};

const timeAgo = (timestamp: number) => {
    const now = Date.now(); // Current time in milliseconds
    const diffInMillis = now - timestamp; // Time difference in milliseconds

    const seconds = Math.floor(diffInMillis / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    // Logic to format time based on conditions
    if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (days < 7) {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (weeks < 4) {
        return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    } else {
        return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
};




interface SummonerData {
    id: string;
    accountId: string;
    puuid: string;
    name: string;
    profileIconId: number;
    summonerLevel: number;
}

interface MatchData {
    metadata: { matchId: string };
    info: {
        gameMode: string; // Game Mode
        gameDuration: number; // Calculate gametime
        gameStartTimestamp: number; // Game Start Time
        participants: {
            riotIdGameName: string; // Only include riotIdGameName
            puuid: string; // PUUID to fetch summoners rank
            doublekill: number; // Highest kill counter
            triplekill: number; // Highest kill counter
            quadrakill: number; // Highest kill counter
            pentakill: number; // Highest kill counter
            kills: number; // KDA
            assists: number; // KDA
            deaths: number; // KDA
            item0: number; // Items
            item1: number; // Items
            item2: number; // Items
            item3: number; // Items
            item4: number; // Items
            item5: number; // Items
            item6: number; // Items
            championName: string; // Champion Name
            championLevel: number; // Champion Level
            totalMinionsKilled: number; // CS
            win: boolean; // Win or Loss
        }[];
    };
}

@observer
export default class SummonerSearch extends React.Component {
    @observable summonerName: string = '';
    @observable summonerData: SummonerData | null = null;
    @observable errorMessage: string = '';
    @observable matchHistory: MatchData[] = [];

    constructor(props: {}) {
        super(props);
        makeObservable(this);
    }

    @action
    handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.summonerName = event.target.value;
        this.errorMessage = '';
    };

    @action
    handleSearch = async () => {
        const apiKey = process.env.REACT_APP_RIOT_API_KEY;

        if (!apiKey) {
            this.errorMessage = 'API key is missing. Check your .env file.';
            return;
        }

        const [gameName, tagLine] = this.summonerName.replace(/\s/g, '').split('#');
        if (!gameName || !tagLine) {
            this.errorMessage = 'Invalid Riot ID format. Use Name#Tag (e.g., Player#NA1).';
            return;
        }

        try {
            // Check cache first for PUUID
            const cachedAccountData = playerCache[`${gameName}#${tagLine}`];
            let puuid;

            if (cachedAccountData) {
                // If the data is cached, use it
                puuid = cachedAccountData.puuid;
            } else {
                // If not cached, fetch from API
                const accountResponse = await fetch(
                    `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
                    { headers: { 'X-Riot-Token': apiKey } }
                );

                if (!accountResponse.ok) throw new Error('Riot ID not found.');
                const accountData = await accountResponse.json();
                puuid = accountData.puuid;

                // Cache the result
                playerCache[`${gameName}#${tagLine}`] = accountData;
            }

            // Check cache for Summoner Data
            if (playerCache[puuid]) {
                // If the summoner data is cached, use it
                this.summonerData = playerCache[puuid];
                this.errorMessage = '';
            } else {
                // If not cached, fetch from API
                const summonerResponse = await fetch(
                    `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                    { headers: { 'X-Riot-Token': apiKey } }
                );
                if (!summonerResponse.ok) throw new Error('Failed to retrieve summoner data.');

                this.summonerData = await summonerResponse.json();
                this.errorMessage = '';

                // Cache the summoner data
                playerCache[puuid] = this.summonerData;
            }

            // Fetch Match History (not cached here, assume it's a separate fetch)
            await this.fetchMatchHistory(puuid, apiKey);
        } catch (error) {
            this.errorMessage = 'Error fetching summoner data. Try again later.';
            console.error(error);
        }
    };

    fetchItemDetails = async (itemId: number) => {
        const response = await fetch(
            `https://ddragon.leagueoflegends.com/cdn/14.3.1/data/en_US/item.json`
        );
        const data = await response.json();
        const item = data.data[itemId];
        return item;
    };


    @action
    fetchMatchHistory = async (puuid: string, apiKey: string) => {
        try {
            // Fetch match IDs
            const matchIds = await fetchWithRetry(
                `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=5`,
                { headers: { 'X-Riot-Token': apiKey } }
            );

            // Fetch match details with Riot IDs
            const matchDetails = await Promise.all(
                matchIds.map(async (matchId: string) => {
                    const matchData = await fetchWithRetry(
                        `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
                        { headers: { 'X-Riot-Token': apiKey } }
                    );

                    console.log(`Match Data for ${matchId}:`, matchData); // Log raw match data

                    // Create a copy of participants and add riotIdGameName
                    const participantsWithRiotID = await Promise.all(
                        matchData.info.participants.map(async (player: any) => {
                            const accountData = await fetchWithRetry(
                                `https://americas.api.riotgames.com/riot/account/v1/accounts/by-puuid/${player.puuid}`,
                                { headers: { 'X-Riot-Token': apiKey } }
                            );
                            return { ...player, riotIdGameName: accountData.gameName };
                        })
                    );

                    // Create a copy of matchData and update participants
                    const matchDataCopy = structuredClone(matchData); // Modern deep copy
                    matchDataCopy.info = { ...matchData.info }; // Shallow copy of matchData.info

                    return matchDataCopy; // Return the modified copy
                })
            );

            // Assign match details to matchHistory
            this.matchHistory = matchDetails;

            // Log the entire match history for debugging
            console.log('Full Match History:', this.matchHistory);
        } catch (error) {
            this.errorMessage = 'Failed to fetch match history.';
            console.error('Error in fetchMatchHistory:', error);
        }
    };



    render() {
        return (
            <div>
                <input
                    type="text"
                    value={this.summonerName}
                    onChange={this.handleInputChange}
                    placeholder="Enter Riot ID (e.g., Player#NA1)"
                />
                <button onClick={this.handleSearch}>Search</button>

                {this.errorMessage && <p style={{ color: 'red' }}>{this.errorMessage}</p>}

                {this.summonerData && (
                    <div className="summonerData">
                        <h3>Summoner Data</h3>
                        <p>Name: {this.summonerData.name}</p>
                        <p>Level: {this.summonerData.summonerLevel}</p>
                        <img
                            src={`http://ddragon.leagueoflegends.com/cdn/14.3.1/img/profileicon/${this.summonerData.profileIconId}.png`}
                            alt="Profile Icon"
                            width="100"
                            height="100"
                        />
                    </div>
                )}

                {this.matchHistory.length > 0 && (
                    <div className="matchHistory">
                        <h3>Recent Matches</h3>
                        {this.matchHistory.map((match, index) => {
                            // Split participants into two groups
                            const firstFiveParticipants = match.info.participants.slice(0, 5);
                            const secondFiveParticipants = match.info.participants.slice(5, 10);

                            const searchedParticipant = match.info.participants.find(
                                (player: any) => player.puuid === this.summonerData?.puuid
                            );


                            return (
                                <div key={index} className="matchCard">

                                    {/* Display searched participant data */}
                                    <div className="searchedParticipantCard">
                                        <div className="gameInfo">
                                            <p>{match.info.gameMode}</p>
                                            <p>{timeAgo(match.info.gameStartTimestamp)}</p>

                                            {/* Conditional rendering for the Victory/Defeat */}
                                            <p>
                                                {(() => {
                                                    if (!searchedParticipant) {
                                                        return <span>Loading...</span>;  // or any loading state
                                                    }

                                                    return searchedParticipant.win ? (
                                                        <span style={{ color: 'green' }}>Victory</span>
                                                    ) : (
                                                        <span style={{ color: 'red' }}>Defeat</span>
                                                    );
                                                })()}
                                            </p>

                                            <p>{Math.floor(match.info.gameDuration / 60)} mins</p>
                                        </div>
                                        <div className="championInfo"></div>
                                        <div className="lobbyInfo"></div>
                                    </div>




                                    {/* Display Participants with riotIdGameName */}
                                    {match.info.participants.length > 0 && (
                                        <>
                                            <h4>Participants:</h4>
                                            <div className="participantsContainer">
                                                <ul className="participantsColumn">
                                                    {firstFiveParticipants.map((player, idx) => (
                                                        <li key={idx}>
                                                            {player.riotIdGameName}

                                                            {/* Display item images */}
                                                            <div className="items">
                                                                {[player.item0, player.item1, player.item2, player.item3, player.item4, player.item5, player.item6].map((itemId, itemIndex) => {
                                                                    if (itemId !== 0) { // Only display item if itemId is not 0
                                                                        const itemImageUrl = getItemImageUrl(itemId);
                                                                        return <img key={itemIndex} src={itemImageUrl} alt={`Item ${itemId}`} width="30" height="30" />;
                                                                    }
                                                                    return null;
                                                                })}
                                                            </div>

                                                        </li>
                                                    ))}
                                                </ul>
                                                <ul className="participantsColumn">
                                                    {secondFiveParticipants.map((player, idx) => (
                                                        <li key={idx + 5}> {/* Use idx + 5 to avoid key conflicts */}
                                                            {player.riotIdGameName}

                                                            {/* Display item images */}
                                                            <div className="items">
                                                                {[player.item0, player.item1, player.item2, player.item3, player.item4, player.item5, player.item6].map((itemId, itemIndex) => {
                                                                    if (itemId !== 0) { // Only display item if itemId is not 0
                                                                        const itemImageUrl = getItemImageUrl(itemId);
                                                                        return <img key={itemIndex} src={itemImageUrl} alt={`Item ${itemId}`} width="30" height="30" />;
                                                                    }
                                                                    return null;
                                                                })}
                                                            </div>

                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </>
                                    )}
                                    <hr />
                                </div>
                            );
                        })}
                    </div>
                )}


                <Link to={`/`}>GO TO HOME</Link>
            </div>
        );
    }
}