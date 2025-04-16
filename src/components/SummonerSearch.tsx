import React, { useEffect, useState } from 'react';
import './SummonerSearch.css';
import { makeObservable, observable, action } from 'mobx';
import { observer } from 'mobx-react';
import { Link } from 'react-router-dom';
import Bottleneck from 'bottleneck';



const limiter = new Bottleneck({
    reservoir: 90, // Allow 100 requests per cycle
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
                console.warn(`Rate limit hit. Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Fixed delay instead of exponential
            } else if (i === retries - 1) {
                throw error; // Throw error if all retries fail
            }
        }
    }
};

const playerCache: Record<string, any> = {}; // Store fetched Riot ID data

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

const getQueueName = (queueId: number): string => {
    switch (queueId) {
        case 420: return "Ranked Solo/Duo";
        case 430: return "Normal Blind";
        case 440: return "Ranked Flex";
        case 400: return "Normal Draft";
        case 450: return "ARAM";
        case 700: return "Clash";
        case 900: return "URF";
        default: return "Other";
    }
};

const summonerSpellIdMap: { [id: number]: string } = {
    1: "SummonerBoost",         // Ghost
    3: "SummonerExhaust",       // Exhaust
    4: "SummonerFlash",         // Flash
    6: "SummonerHaste",         // Haste
    7: "SummonerHeal",          // Heal
    11: "SummonerSmite",        // Smite
    12: "SummonerTeleport",     // Teleport
    13: "SummonerMana",         // Clarity
    14: "SummonerDot",          // Ignite
    21: "SummonerBarrier",      // Barrier
    32: "SummonerSnowball",     // Snowball
    39: "SummonerChillingSmite",// Chilling Smite
    55: "SummonerPoroRecall",   // Poro Recall
    56: "SummonerMark",         // Mark (used by Kindred)
    57: "SummonerPoroThrow",    // Poro Throw
    59: "SummonerPoroCoin",     // Poro Coin
    61: "SummonerShurimaRecall",// Shurima Recall
};

// REVISIT
const fetchRankedData = async (summonerId: string, apiKey: string): Promise<RankedData | null> => {
    try {
        const response = await fetch(
            `https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`,
            {
                headers: {
                    'X-Riot-Token': apiKey,
                },
            }
        );

        if (!response.ok) {
            console.error('Response not OK:', response);
            throw new Error('Failed to fetch ranked data');
        }

        const rankedEntries: RankedData[] = await response.json();
        console.log('Ranked entries:', rankedEntries);

        const soloDuo = rankedEntries.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
        const flex = rankedEntries.find(entry => entry.queueType === 'RANKED_FLEX_SR');

        return soloDuo || flex || null;

    } catch (error) {
        console.error('Error fetching ranked data:', error);
        return null;
    }
};


const rankToScore: { [key: string]: number } = {
    "IRON IV": 1, "IRON III": 2, "IRON II": 3, "IRON I": 4,
    "BRONZE IV": 5, "BRONZE III": 6, "BRONZE II": 7, "BRONZE I": 8,
    "SILVER IV": 9, "SILVER III": 10, "SILVER II": 11, "SILVER I": 12,
    "GOLD IV": 13, "GOLD III": 14, "GOLD II": 15, "GOLD I": 16,
    "PLATINUM IV": 17, "PLATINUM III": 18, "PLATINUM II": 19, "PLATINUM I": 20,
    "DIAMOND IV": 21, "DIAMOND III": 22, "DIAMOND II": 23, "DIAMOND I": 24,
    "MASTER": 25,
    "GRANDMASTER": 26,
    "CHALLENGER": 27
};

const rankedDataCache: { [puuid: string]: RankedData | null } = {};

const getRankedDataArrayForMatch = async (
    participantPuuids: string[],
    apiKey: string
): Promise<RankedData[]> => {
    const data: RankedData[] = [];

    // Fetch summoner data if not available in cache
    const summonersToFetch = participantPuuids.filter((puuid) => !playerCache[puuid]);

    // If there are summoners to fetch, do so concurrently
    if (summonersToFetch.length > 0) {
        const summonerPromises = summonersToFetch.map(async (puuid) => {
            const res = await fetch(
                `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                { headers: { 'X-Riot-Token': apiKey } }
            );
            if (!res.ok) return null;
            const summoner = await res.json();
            playerCache[puuid] = summoner;
            return summoner;
        });

        const fetchedSummoners = await Promise.all(summonerPromises);

        // Filter out any failed fetches
        const validSummoners = fetchedSummoners.filter((summoner) => summoner != null) as any[];

        // Fetch ranked data for valid summoners
        const rankedDataPromises = validSummoners.map(async (summoner) => {
            const rankedData = await fetchRankedData(summoner.id, apiKey);
            rankedDataCache[summoner.puuid] = rankedData;
            return rankedData;
        });

        const rankedDataArray = await Promise.all(rankedDataPromises);

        // Add ranked data to final result (filter out null values)
        rankedDataArray.forEach((rankedData) => {
            if (rankedData) {
                data.push(rankedData);
            }
        });
    }

    // For participants that are already in cache, directly fetch the ranked data
    const cachedRankedData = participantPuuids
        .filter((puuid) => rankedDataCache[puuid])
        .map((puuid) => rankedDataCache[puuid])
        .filter((rankedData) => rankedData !== null); // Filter out null ranked data

    data.push(...cachedRankedData.filter((rankedData) => rankedData !== null) as RankedData[]);

    return data;
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
    metadata: {
        matchId: string
        participants: string[]; // Array of PUUID strings
    };
    info: {
        gameDuration: number;
        gameStartTimestamp: number;
        queueId: number;
        participants: {
            riotIdGameName: string;
            puuid: string;
            doublekill: number;
            triplekill: number;
            quadrakill: number;
            pentakill: number;
            kills: number;
            assists: number;
            deaths: number;
            item0: number;
            item1: number;
            item2: number;
            item3: number;
            item4: number;
            item5: number;
            item6: number;
            championName: string;
            champLevel: number;
            totalMinionsKilled: number;
            win: boolean;
            summoner1Id: number; //ADDED VARIABLE
            summoner2Id: number; //ADDED VARIABLE

            perks: {
                statPerks: {
                    defense: number;
                    flex: number;
                    offense: number;
                };
                styles: {
                    description: string;
                    style: number;
                    selections: {
                        perk: number;
                        var1: number;
                        var2: number;
                        var3: number;
                    }[];
                }[];
            };
        }[];
    };
}

interface runeSlot {
    runes: runePerk[];
}

interface runeStyle {
    id: number;
    key: number;
    icon: string;
    name: string;
    slots: runeSlot[];
}

interface runePerk {
    id: number;
    key: number;
    icon: string;
    name: string;
    shortDesc: string;
    longDesc: string;
}

interface RankedData {
    puuid: string;      // Unique player identifier
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    queueType: string;
}


@observer
export default class SummonerSearch extends React.Component {
    @observable summonerName: string = 'FrankTheTank27#NA1';
    // @observable summonerName: string = '';
    @observable summonerData: SummonerData | null = null;
    @observable errorMessage: string = '';
    @observable matchHistory: MatchData[] = [];
    @observable runesReforged: runeStyle[] = [];
    @observable rankedData: RankedData | null = null;
    @observable averageRank = "Unranked";  // Make sure to mark it as observable



    constructor(props: {}) {
        super(props);
        makeObservable(this);
    }

    componentDidMount(): void {
        this.loadRunesReforged();
    }

    @action
    getRuneStyleIconURL = (styleId: number) => {
        const runeStyle = this.runesReforged.find((style) => style.id === styleId);
        if (runeStyle) {
            return `https://ddragon.leagueoflegends.com/cdn/img/${runeStyle.icon}`;
        }
        console.error(`StyleId ${styleId} not found in runeStyleMap`);  // Debugging line
        return '/fallback-icon.png'; // Fallback if no matching rune style is found
    };

    @action
    getRunePerkIconURL = (styleId: number, perkId: number) => {
        let url = '/fallback-icon.png';
        const runeStyle = this.runesReforged.find((style) => style.id === styleId);
        runeStyle?.slots.forEach((slot) => {
            const foundPerk = slot.runes.find((perk) => perk.id === perkId);
            if (foundPerk) {
                url = `https://ddragon.leagueoflegends.com/cdn/img/${foundPerk.icon}`;
            }
        }
        );
        return url
    };

    @action setRankedData = (data: RankedData | null) => {
        this.rankedData = data;
    };


    @action
    setErrorMessage(message: string) {
        this.errorMessage = message;
    }

    @action
    setSummonerData(data: SummonerData) {
        this.summonerData = data;
        this.errorMessage = '';
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
            this.setErrorMessage('API key is missing. Check your .env file.');
            return;
        }

        const [gameName, tagLine] = this.summonerName.replace(/\s/g, '').split('#');
        if (!gameName || !tagLine) {
            this.setErrorMessage('Invalid Riot ID format. Use Name#Tag (e.g., Player#NA1).');
            return;
        }

        try {
            const cacheKey = `${gameName}#${tagLine}`;
            const cachedAccountData = playerCache[cacheKey];
            let puuid;

            if (cachedAccountData) {
                puuid = cachedAccountData.puuid;
            } else {
                const accountResponse = await fetch(
                    `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
                    { headers: { 'X-Riot-Token': apiKey } }
                );

                if (!accountResponse.ok) throw new Error('Riot ID not found.');
                const accountData = await accountResponse.json();
                puuid = accountData.puuid;

                playerCache[cacheKey] = accountData;
            }

            // If cached player data is available, use it
            if (playerCache[puuid]) {
                this.setSummonerData(playerCache[puuid]);
            } else {
                const summonerResponse = await fetch(
                    `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                    { headers: { 'X-Riot-Token': apiKey } }
                );

                if (!summonerResponse.ok) throw new Error('Failed to retrieve summoner data.');

                // Fetch Summoner Data
                const summonerData = await summonerResponse.json();
                this.setSummonerData(summonerData);
                playerCache[puuid] = summonerData;

                // Fetch Rank Data
                const rankData = await fetchRankedData(summonerData.id, apiKey);
                this.setRankedData(rankData);

                rankedDataCache[puuid] = rankData;
            }

            // Fetch match history
            await this.fetchMatchHistory(puuid, apiKey);

        } catch (error) {
            this.setErrorMessage('Error fetching summoner data. Try again later.');
            console.error(error);
        }
    };


    @action
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
                `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`,
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

                    const participantPuuids = matchData.metadata.participants;

                    // Fetch ranked data for participants
                    const rankedDataArray = await getRankedDataArrayForMatch(participantPuuids, apiKey);

                    // Create a copy of matchData and update participants with ranked data
                    const matchDataCopy = structuredClone(matchData); // Modern deep copy
                    matchDataCopy.info = { ...matchData.info }; // Shallow copy of matchData.info

                    // Add ranked data to each participant in matchDataCopy
                    matchDataCopy.info.participants = matchDataCopy.info.participants.map((participant: any) => {
                        const rankedData = rankedDataArray.find(
                            (data) => data.puuid === participant.puuid
                        );
                        if (rankedData) {
                            // Add ranked data (for example, rank, tier, and division) to the participant
                            participant.rank = rankedData.rank;
                            participant.tier = rankedData.tier;
                            participant.leaguePoints = rankedData.leaguePoints;
                        }
                        return participant;
                    });

                    // Call fetchAverageRank here to calculate and set the average rank after match data is fetched
                    await this.fetchAverageRank(matchDataCopy, apiKey);

                    return matchDataCopy; // Return the modified copy with added ranked data
                })
            );

            return matchDetails;
        } catch (error) {
            console.error('Error fetching match history:', error);
        }
    };


    @action
    loadRunesReforged = async () => {
        const response = await fetch(
            `https://ddragon.leagueoflegends.com/cdn/14.3.1/data/en_US/runesReforged.json`
        );
        this.runesReforged = await response.json();
    };

    @action
    fetchAverageRank = async (match: MatchData, apiKey: string) => {
        try {
            const rankedDataArray = await getRankedDataArrayForMatch(
                match.info.participants.map(p => p.puuid),
                apiKey
            );

            const scores = rankedDataArray.map(entry => {
                if (!entry || !entry.tier) return 0;

                const tier = entry.tier.toUpperCase();
                const division = entry.rank ? entry.rank.toUpperCase() : "";
                const key = tier === "MASTER" || tier === "GRANDMASTER" || tier === "CHALLENGER"
                    ? tier
                    : `${tier} ${division}`;

                return rankToScore[key] || 0;
            });

            const validScores = scores.filter(score => score > 0);
            const averageRankScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;

            const scoreToRank = Object.entries(rankToScore).reduce((acc, [key, value]) => {
                acc[value] = key;
                return acc;
            }, {} as { [key: number]: string });

            const roundedAverage = Math.round(averageRankScore);
            const averageRankLabel = scoreToRank[roundedAverage] || "Unranked";

            this.averageRank = averageRankLabel;
            console.log("Computed average rank:", this.averageRank);

            // Optionally force re-render if needed
            this.setState({});
        } catch (error) {
            console.error("Error fetching ranked data:", error);
            this.averageRank = "Unranked";
            this.setState({});
        }
    };



    render() {
        return (
            <div className="contentContainer">
                <div className="searchContainer">
                    <input className="inputContainer"
                        type="text"
                        value={this.summonerName}
                        onChange={this.handleInputChange}
                        placeholder="Enter Riot ID (e.g., Player#NA1)"
                    />
                    <button className="buttonSearch" onClick={this.handleSearch}>Search</button>

                    {this.errorMessage && <p style={{ color: 'red' }}>{this.errorMessage}</p>}
                </div>
                {this.matchHistory.length > 0 && (
                    <div className="matchHistory">
                        <h3>Recent Matches</h3>
                        <div className="summonerProfile">
                            {this.rankedData ? (
                                <div className="RankedScore">
                                    Current Rank: {this.rankedData.tier} {this.rankedData.rank} - {this.rankedData.leaguePoints} LP
                                </div>
                            ) : (
                                <div className="RankedScore">Unranked</div>
                            )}
                        </div>
                        {this.matchHistory.map((match, index) => {
                            // Split participants into two groups
                            const firstFiveParticipants = match.info.participants.slice(0, 5);
                            const secondFiveParticipants = match.info.participants.slice(5, 10);

                            const searchedParticipant = match.info.participants.find(
                                (player: any) => player.puuid === this.summonerData?.puuid
                            );



                            return (

                                <div key={index} className="matchCard">
                                    <div className={`searchedParticipantCard ${searchedParticipant?.win ? 'win' : 'loss'}`}>
                                        {/* Game Info */}
                                        <div className="gameInfo">
                                            <div className="gameInfoType">
                                                <div className={`blueRedSpan ${searchedParticipant?.win ? 'win' : 'loss'}`}>
                                                    {getQueueName(match.info.queueId)}
                                                </div>
                                                <div className="graySpan">{timeAgo(match.info.gameStartTimestamp)}</div>
                                            </div>
                                            <div>--</div>
                                            <div className="gameInfoWinLoss">
                                                {!searchedParticipant ? (
                                                    <span>Loading...</span>
                                                ) : (
                                                    <div className="graySpan">
                                                        {searchedParticipant.win ? 'Victory' : 'Defeat'}
                                                    </div>
                                                )}
                                                <div className="graySpan">
                                                    {Math.floor(match.info.gameDuration / 60)}m {match.info.gameDuration % 60}s
                                                </div>
                                            </div>
                                        </div>

                                        {/* Champion Info */}
                                        <div className="championInfo">
                                            {searchedParticipant ? (
                                                <>
                                                    <div className="championInfoContainer">
                                                        <div className="spriteContainer">
                                                            <img
                                                                className="championSprite"
                                                                src={`https://ddragon.leagueoflegends.com/cdn/15.6.1/img/champion/${searchedParticipant.championName}.png`}
                                                                alt={`${searchedParticipant.championName} Sprite`}
                                                                width="48"
                                                                height="48"
                                                            />
                                                            <div className="championSpriteLevel">
                                                                {searchedParticipant.champLevel}
                                                            </div>
                                                        </div>
                                                        <div className="SummonerSpellAndRunesContainer">
                                                            <div className="SummonerSpellContainer">
                                                                {/* Define spell1Name and spell2Name here */}
                                                                {searchedParticipant && (
                                                                    <>
                                                                        {(() => {
                                                                            const spell1Name = summonerSpellIdMap[searchedParticipant.summoner1Id];
                                                                            const spell2Name = summonerSpellIdMap[searchedParticipant.summoner2Id];

                                                                            // Define URLs for spell icons
                                                                            const spell1Url = spell1Name
                                                                                ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell1Name}.png`
                                                                                : "/fallback-icon.png"; // Fallback if spell is missing
                                                                            const spell2Url = spell2Name
                                                                                ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell2Name}.png`
                                                                                : "/fallback-icon.png"; // Fallback if spell is missing

                                                                            return (
                                                                                <>
                                                                                    <img
                                                                                        src={spell1Url}
                                                                                        alt={`Summoner Spell 1 - ${spell1Name}`}
                                                                                        width="22"
                                                                                        height="22"
                                                                                    />
                                                                                    <img
                                                                                        src={spell2Url}
                                                                                        alt={`Summoner Spell 2 - ${spell2Name}`}
                                                                                        width="22"
                                                                                        height="22"
                                                                                    />
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="RunesContainer">
                                                                <img
                                                                    src={this.getRunePerkIconURL(searchedParticipant.perks.styles[0].style, searchedParticipant.perks.styles[0].selections[0].perk)}
                                                                    alt="Keystone Rune"
                                                                    width="22"
                                                                    height="22"
                                                                />

                                                                <img
                                                                    src={this.getRuneStyleIconURL(searchedParticipant.perks.styles[1].style)}
                                                                    alt="Secondary Rune Style"
                                                                    width="22"
                                                                    height="22"
                                                                />

                                                            </div>
                                                        </div>
                                                        <div className="KDAContainer">
                                                            {/* KDA Display */}
                                                            <div className="KDAScore">
                                                                {searchedParticipant.kills} / <span className="death-text">{searchedParticipant.deaths}</span> / {searchedParticipant.assists}
                                                            </div>
                                                            <div className="KDAComparison">
                                                                {(() => {
                                                                    const { kills, assists, deaths } = searchedParticipant;
                                                                    const kdaValue = deaths === 0 ? kills + assists : (kills + assists) / deaths;
                                                                    return `${kdaValue.toFixed(2)} : 1 KDA`;
                                                                })()}
                                                            </div>

                                                        </div>
                                                        {/* Kill Participation Display */}
                                                        <div className="KPCSRankContainer">
                                                            <div className="KPScore">
                                                                {(() => {
                                                                    // Find participant index (used to infer team)
                                                                    const participantIndex = match.info.participants.findIndex(
                                                                        p => p.puuid === searchedParticipant.puuid
                                                                    );

                                                                    const isTeamOne = participantIndex < 5;

                                                                    // Get team kills
                                                                    const teamKills = match.info.participants
                                                                        .filter((_, idx) => (isTeamOne ? idx < 5 : idx >= 5))
                                                                        .reduce((sum, p) => sum + p.kills, 0);

                                                                    // Calculate KP
                                                                    const playerKP =
                                                                        teamKills > 0
                                                                            ? ((searchedParticipant.kills + searchedParticipant.assists) / teamKills) * 100
                                                                            : 0;

                                                                    return `P/Kill ${playerKP.toFixed(0)}%`;
                                                                })()}
                                                            </div>
                                                            <div className="CScore">
                                                                CS {searchedParticipant.totalMinionsKilled}
                                                                &nbsp;({(searchedParticipant.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(1)} CS/min)
                                                            </div>
                                                            <div className="AverageMatchRank">
                                                                Average Rank: {this.averageRank ? this.averageRank : "Unranked"}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="items">
                                                        {[searchedParticipant.item0, searchedParticipant.item1, searchedParticipant.item2, searchedParticipant.item3, searchedParticipant.item4, searchedParticipant.item5, searchedParticipant.item6].map(
                                                            (itemId, itemIndex) => {
                                                                if (itemId !== 0) {
                                                                    const itemImageUrl = getItemImageUrl(itemId);
                                                                    return (
                                                                        <img
                                                                            key={itemIndex}
                                                                            src={itemImageUrl}
                                                                            alt={`Item ${itemId}`}
                                                                            width="22"
                                                                            height="22"
                                                                        />
                                                                    );
                                                                } else {
                                                                    return (
                                                                        <div
                                                                            key={itemIndex}
                                                                            className={`itemPlaceholder ${searchedParticipant.win ? 'win' : 'loss'}`}
                                                                        />
                                                                    );
                                                                }
                                                            }
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div>Loading...</div>
                                            )}
                                        </div>

                                        {/* Match Participants - Inside the card, outside championInfo */}
                                        <div className="matchParticipantsContainer">
                                            <div className="matchParticipantsGroupOne">
                                                {match.info.participants.slice(0, 5).map((player, idx) => (
                                                    <div key={idx} className="participantItem">
                                                        <img
                                                            src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                            alt={player.championName}
                                                            width="16"
                                                            height="16"
                                                        />
                                                        <span className="participantName">{player.riotIdGameName}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="matchParticipantsGroupTwo">
                                                {match.info.participants.slice(5, 10).map((player, idx) => (
                                                    <div key={idx + 5} className="participantItem">
                                                        <img
                                                            src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                            alt={player.championName}
                                                            width="16"
                                                            height="16"
                                                        />
                                                        <span className="participantName">{player.riotIdGameName}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>




                                    {/* Display Participants with riotIdGameName */}
                                    {
                                        match.info.participants.length > 0 && (
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
                                        )
                                    }
                                    <hr />
                                </div>
                            );
                        })}
                    </div>
                )
                }


                <Link to={`/`}>GO TO HOME</Link>
            </div >
        );
    }
}