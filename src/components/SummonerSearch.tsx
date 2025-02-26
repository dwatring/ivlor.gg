import React from 'react';
import './SummonerSearch.css';
import { makeObservable, observable, action } from 'mobx';
import { observer } from 'mobx-react';
import { Link } from 'react-router-dom';
import Bottleneck from 'bottleneck';


const limiter = new Bottleneck({
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 2 * 60 * 1000,
    maxConcurrent: 20,
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

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetchWithLimiter(url, options);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error; // Throw error if all retries fail
            console.log(`Retrying request (${i + 1}/${retries})...`);
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
        }
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
        gameMode: string;
        gameDuration: number;
        participants: {
            riotIdGameName: string; // Only include riotIdGameName
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
            // Get PUUID
            const accountResponse = await fetch(
                `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
                { headers: { 'X-Riot-Token': apiKey } }
            );

            if (!accountResponse.ok) throw new Error('Riot ID not found.');
            const accountData = await accountResponse.json();
            const puuid = accountData.puuid;

            // Get Summoner Details
            const summonerResponse = await fetch(
                `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                { headers: { 'X-Riot-Token': apiKey } }
            );
            if (!summonerResponse.ok) throw new Error('Failed to retrieve summoner data.');

            this.summonerData = await summonerResponse.json();
            this.errorMessage = '';

            // Fetch Match History
            await this.fetchMatchHistory(puuid, apiKey);
        } catch (error) {
            this.errorMessage = 'Error fetching summoner data. Try again later.';
            console.error(error);
        }
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

                            // Create a copy of the player object and add riotIdGameName
                            const playerCopy = { ...player }; // Shallow copy of the player object
                            playerCopy.riotIdGameName = accountData.gameName; // Add riotIdGameName to the copy

                            return playerCopy; // Return the modified copy
                        })
                    );

                    // Create a copy of matchData and update participants
                    const matchDataCopy = { ...matchData }; // Shallow copy of matchData
                    matchDataCopy.info = { ...matchData.info }; // Shallow copy of matchData.info
                    matchDataCopy.info.participants = participantsWithRiotID; // Update participants with the copied array

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

                            return (
                                <div key={index} className="matchCard">
                                    <p><strong>Match ID:</strong> {match.metadata.matchId}</p>
                                    <p><strong>Game Mode:</strong> {match.info.gameMode}</p>
                                    <p><strong>Game Duration:</strong> {Math.floor(match.info.gameDuration / 60)} mins</p>

                                    {/* Display Participants with riotIdGameName */}
                                    {match.info.participants.length > 0 && (
                                        <>
                                            <h4>Participants:</h4>
                                            <div className="participantsContainer">
                                                <ul className="participantsColumn">
                                                    {firstFiveParticipants.map((player, idx) => (
                                                        <li key={idx}>
                                                            {player.riotIdGameName}
                                                        </li>
                                                    ))}
                                                </ul>
                                                <ul className="participantsColumn">
                                                    {secondFiveParticipants.map((player, idx) => (
                                                        <li key={idx + 5}> {/* Use idx + 5 to avoid key conflicts */}
                                                            {player.riotIdGameName}
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