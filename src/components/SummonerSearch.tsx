/* eslint-disable prettier/prettier */
import React from 'react'
import './SummonerSearch.css'
import { makeObservable, observable, action, runInAction } from 'mobx'
import { observer } from 'mobx-react'
import { Link } from 'react-router-dom'
import Bottleneck from 'bottleneck'
import SummonerMatchDetailCard from './SummonerMatchDetailCard'
import { Participant } from '../lib/interfaces'
import { getItemImageUrl, summonerSpellIdMap } from '../lib/constants'

const limiter = new Bottleneck({
    reservoir: 90, // Allow 100 requests per cycle
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 2 * 60 * 1000, // Every 2 minutes
    maxConcurrent: 5, // 🔽 Reduce concurrent requests
})

const fetchWithLimiter = limiter.wrap(async (url: string, options: RequestInit) => {
    try {
        const response = await fetch(url, options)
        if (!response.ok) {
            const errorDetails = await response.text() // Get the error message from the response
            console.error(`API request failed: ${response.status} - ${errorDetails}`)
            throw new Error(`API request failed: ${response.status} - ${errorDetails}`)
        }
        return response.json()
    } catch (error) {
        console.error('Error in fetchWithLimiter:', error)
        throw error
    }
})

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetchWithLimiter(url, options)
            return response
        } catch (error: any) {
            if (error.message.includes('429')) {
                console.warn(`Rate limit hit. Retrying in ${delay / 1000} seconds...`)
                await new Promise((resolve) => setTimeout(resolve, delay)) // Fixed delay instead of exponential
            } else if (i === retries - 1) {
                throw error // Throw error if all retries fail
            }
        }
    }
}

const playerCache: Record<string, any> = {} // Store fetched Riot ID data

const timeAgo = (timestamp: number) => {
    const now = Date.now() // Current time in milliseconds
    const diffInMillis = now - timestamp // Time difference in milliseconds

    const seconds = Math.floor(diffInMillis / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)

    // Logic to format time based on conditions
    if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else if (days < 7) {
        return `${days} day${days !== 1 ? 's' : ''} ago`
    } else if (weeks < 4) {
        return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
    } else {
        return `${months} month${months !== 1 ? 's' : ''} ago`
    }
}

const getQueueName = (queueId: number): string => {
    switch (queueId) {
        case 420:
            return 'Ranked Solo/Duo'
        case 430:
            return 'Normal Blind'
        case 440:
            return 'Ranked Flex'
        case 400:
            return 'Normal Draft'
        case 450:
            return 'ARAM'
        case 700:
            return 'Clash'
        case 900:
            return 'URF'
        default:
            return 'Other'
    }
}

const rankToScore: { [key: string]: number } = {
    'IRON IV': 1,
    'IRON III': 2,
    'IRON II': 3,
    'IRON I': 4,
    'BRONZE IV': 5,
    'BRONZE III': 6,
    'BRONZE II': 7,
    'BRONZE I': 8,
    'SILVER IV': 9,
    'SILVER III': 10,
    'SILVER II': 11,
    'SILVER I': 12,
    'GOLD IV': 13,
    'GOLD III': 14,
    'GOLD II': 15,
    'GOLD I': 16,
    'PLATINUM IV': 17,
    'PLATINUM III': 18,
    'PLATINUM II': 19,
    'PLATINUM I': 20,
    'DIAMOND IV': 21,
    'DIAMOND III': 22,
    'DIAMOND II': 23,
    'DIAMOND I': 24,
    MASTER: 25,
    GRANDMASTER: 26,
    CHALLENGER: 27,
}

const rankColors: { [key: string]: string } = {
    IRON: '#5e4b47',         // dark brownish gray
    BRONZE: '#a97142',       // bronze
    SILVER: '#9faecf',       // soft silver-blue
    GOLD: '#d4af37',         // classic gold
    PLATINUM: '#27e2a4',     // teal green
    EMERALD: '#20c997',      // vibrant green
    DIAMOND: '#5b9ee9',      // crystal blue
    MASTER: '#b660e1',       // magenta-purple
    GRANDMASTER: '#de453f',  // red-orange
    CHALLENGER: '#e0b75f',   // glowing gold-white
};


const getTierColor = (rank: string): string => {
    if (!rank) return 'gray';
    const tier = rank.split(' ')[0]; // e.g., "GOLD II" → "GOLD"
    return rankColors[tier] || 'gray';
};


// REVISIT
const fetchSummonerRankedData = async (summonerId: string, apiKey: string): Promise<RankedData | null> => {
    try {
        const response = await fetch(`https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`, {
            headers: {
                'X-Riot-Token': apiKey,
            },
        })

        if (!response.ok) {
            console.error('Response not OK:', response)
            throw new Error('Failed to fetch ranked data')
        }

        const rankedEntries: RankedData[] = await response.json()

        const soloDuo = rankedEntries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5')
        const flex = rankedEntries.find((entry) => entry.queueType === 'RANKED_FLEX_SR')

        return soloDuo || flex || null
    } catch (error) {
        console.error('Error fetching ranked data:', error)
        return null
    }
}

const rankedDataCache: { [puuid: string]: RankedData | null } = {}

const fetchMatchRankedData = async (participantPuuids: string[], apiKey: string): Promise<RankedData[]> => {
    const data: RankedData[] = []

    // Skip everything for fully cached puuids
    const uncachedPuuids = participantPuuids.filter((puuid) => !rankedDataCache[puuid]);

    // Now filter only puuids missing summoner data
    const puuidsMissingSummoner = uncachedPuuids.filter((puuid) => !playerCache[puuid]);

    // Batch fetch missing summoner data
    const fetchedSummoners = await Promise.all(
        puuidsMissingSummoner.map(async (puuid) => {
            try {
                const res = await fetch(`https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, {
                    headers: { 'X-Riot-Token': apiKey },
                });
                if (!res.ok) return null;

                const summoner = await res.json();
                playerCache[puuid] = summoner;
                return summoner;
            } catch (err) {
                console.error(`Error fetching summoner for puuid ${puuid}`, err);
                return null;
            }
        })
    );

    // 👇 Merge fetched and already-cached summoners
    const allSummoners = [
        ...fetchedSummoners.filter(Boolean),
        ...uncachedPuuids
            .filter((puuid) => playerCache[puuid])
            .map((puuid) => playerCache[puuid]),
    ];

    // Only fetch ranked data if not already cached
    const newlyFetchedRanked = await Promise.all(
        allSummoners
            .filter((s): s is { id: string; puuid: string } => s && !rankedDataCache[s.puuid])
            .map(async (s) => {
                const ranked = await fetchSummonerRankedData(s.id, apiKey);
                if (ranked) rankedDataCache[s.puuid] = ranked;
                return ranked;
            })
    );

    // Filter nulls before pushing
    data.push(...newlyFetchedRanked.filter((r): r is RankedData => r !== null));

    // Add pre-cached ranked data
    const cached = participantPuuids
        .filter((puuid) => rankedDataCache[puuid])
        .map((puuid) => rankedDataCache[puuid])
        .filter((r): r is RankedData => r !== null);

    data.push(...cached);

    return data;
};

interface SummonerData {
    id: string
    accountId: string
    puuid: string
    name: string
    profileIconId: number
    summonerLevel: number
    tagLine: string
}

interface MatchData {
    metadata: {
        matchId: string
        participants: string[] // Array of PUUID strings
    }
    info: {
        gameDuration: number
        gameStartTimestamp: number
        queueId: number
        participants: Participant[]
        teams: {

            // bans: {

            // }[]
            // feats: {

            // }[]

            objectives: {
                teamId: number
                win: boolean
                atakhan: {
                    first: boolean
                    kills: number
                }
                baron: {
                    first: boolean
                    kills: number
                }
                champion: {
                    first: boolean
                    kills: number
                }
                dragon: {
                    first: boolean
                    kills: number
                }
                horde: {
                    first: boolean
                    kills: number
                }
                inhibitor: {
                    first: boolean
                    kills: number
                }
                riftHerald: {
                    first: boolean
                    kills: number
                }
                tower: {
                    first: boolean
                    kills: number
                }
            }
        }[]
    }
}

interface runeSlot {
    runes: runePerk[]
}

interface runeStyle {
    id: number
    key: number
    icon: string
    name: string
    slots: runeSlot[]
}

interface runePerk {
    id: number
    key: number
    icon: string
    name: string
    shortDesc: string
    longDesc: string
}

interface RankedData {
    puuid: string // Unique player identifier
    tier: string
    rank: string
    leaguePoints: number
    wins: number
    losses: number
    queueType: string
}

@observer
export default class SummonerSearch extends React.Component {
    @observable summonerName = 'FrankTheTank27#NA1'
    // @observable summonerName: string = '';
    @observable summonerData: SummonerData | null = null
    @observable errorMessage = ''
    @observable matchHistory: MatchData[] = []
    @observable runesReforged: runeStyle[] = []
    @observable rankedData: RankedData | null = null
    @observable averageRank = 'Unranked'
    @observable isLoading = false;
    @observable flippedMatches: Record<string, boolean> = {}
    @observable selectedSection = 'Overview'
    @observable expandedMatchDetailsHeight = '200px'

    constructor(props: Record<string, never>) {
        super(props)
        makeObservable(this)
    }

    componentDidMount(): void {
        this.loadRunesReforged()
    }

    @action
    getRuneStyleIconURL = (styleId: number) => {
        const runeStyle = this.runesReforged.find((style) => style.id === styleId)
        if (runeStyle) {
            return `https://ddragon.leagueoflegends.com/cdn/img/${runeStyle.icon}`
        }
        console.error(`StyleId ${styleId} not found in runeStyleMap`) // Debugging line
        return '/fallback-icon.png' // Fallback if no matching rune style is found
    }

    @action
    getRunePerkIconURL = (styleId: number, perkId: number) => {
        let url = '/fallback-icon.png'
        const runeStyle = this.runesReforged.find((style) => style.id === styleId)
        runeStyle?.slots.forEach((slot) => {
            const foundPerk = slot.runes.find((perk) => perk.id === perkId)
            if (foundPerk) {
                url = `https://ddragon.leagueoflegends.com/cdn/img/${foundPerk.icon}`
            }
        })
        return url
    }

    @action setRankedData = (data: RankedData | null) => {
        this.rankedData = data
    }

    @action
    setErrorMessage(message: string) {
        this.errorMessage = message
    }

    @action
    setSummonerData(data: SummonerData) {
        this.summonerData = data
        this.errorMessage = ''
    }

    @action
    handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.summonerName = event.target.value
        this.errorMessage = ''
    }
    @action
    handleSearch = async () => {
        const apiKey = process.env.REACT_APP_RIOT_API_KEY

        if (!apiKey) {
            this.setErrorMessage('API key is missing. Check your .env file.')
            return
        }

        const [gameName, tagLine] = this.summonerName.replace(/\s/g, '').split('#')

        if (!gameName || !tagLine) {
            this.setErrorMessage('Invalid Riot ID format. Use Name#Tag (e.g., Player#NA1).')
            return
        }

        try {
            const cacheKey = `${gameName}#${tagLine}`
            const cachedAccountData = playerCache[cacheKey]
            let puuid: string

            // Step 1: Get PUUID from cache or API
            if (cachedAccountData) {
                puuid = cachedAccountData.puuid
            } else {
                const accountRes = await fetch(
                    `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
                    { headers: { 'X-Riot-Token': apiKey } },
                )

                if (!accountRes.ok) {
                    throw new Error(`Riot ID not found: ${gameName}#${tagLine}`)
                }

                const accountData = await accountRes.json()
                puuid = accountData.puuid
                playerCache[cacheKey] = accountData
            }

            // Step 2: Fetch Summoner Data (cached by puuid)
            let summonerData = playerCache[puuid]
            if (!summonerData) {
                const summonerRes = await fetch(`https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, {
                    headers: { 'X-Riot-Token': apiKey },
                })

                if (!summonerRes.ok) {
                    throw new Error(`Failed to retrieve summoner data for PUUID: ${puuid}`)
                }

                summonerData = await summonerRes.json()
                playerCache[puuid] = summonerData
            }
            summonerData.tagLine = tagLine;

            this.setSummonerData(summonerData)

            // Step 3: Fetch Ranked Data
            let rankData = rankedDataCache[puuid]
            if (!rankData) {
                rankData = await fetchSummonerRankedData(summonerData.id, apiKey)
                rankedDataCache[puuid] = rankData
            }

            this.setRankedData(rankData)

            // Step 4: Fetch Match History
            await this.fetchMatchHistory(puuid, apiKey)
        } catch (error) {
            this.setErrorMessage('Error fetching summoner data. Try again later.')
            console.error('[handleSearch error]', error)
        }
    }

    @action
    fetchItemDetails = async (itemId: number) => {
        const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/14.3.1/data/en_US/item.json`)
        const data = await response.json()
        const item = data.data[itemId]
        return item
    }

    @action
    fetchMatchHistory = async (puuid: string, apiKey: string) => {
        try {
            // Step 1: Fetch recent match IDs
            const matchIds: string[] = await fetchWithRetry(
                `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`,
                { headers: { 'X-Riot-Token': apiKey } },
            );

            console.log('Fetched match IDs:', matchIds);

            if (matchIds.length === 0) {
                console.error('No match history found.');
                this.matchHistory = []; // clear any old data
                return [];
            }

            // Step 2: Fetch and enrich match details
            const matchDetails = await Promise.all(
                matchIds.map(async (matchId: string) => {
                    const matchData = await fetchWithRetry(
                        `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
                        { headers: { 'X-Riot-Token': apiKey } },
                    );

                    console.log(`[MATCH ${matchId}] Raw Data:`, matchData);

                    if (!matchData) {
                        console.error(`[MATCH ${matchId}] No match data found.`);
                        return null;
                    }

                    const participantPuuids = matchData.metadata.participants;
                    const rankedDataArray = await fetchMatchRankedData(participantPuuids, apiKey);

                    matchData.info.participants = matchData.info.participants.map((participant: any) => {
                        const rankedData = rankedDataArray.find((data) => data.puuid === participant.puuid);
                        return rankedData
                            ? {
                                ...participant,
                                rank: rankedData.rank,
                                tier: rankedData.tier,
                                leaguePoints: rankedData.leaguePoints,
                            }
                            : participant;
                    });

                    await this.fetchAverageRank(matchData, apiKey);

                    return matchData;
                }),
            );

            // ✅ Store in MobX state
            this.matchHistory = matchDetails.filter(Boolean); // filter out nulls if any

            console.log('Returning matchDetails:', this.matchHistory);

            return this.matchHistory;
        } catch (error) {
            console.error('[fetchMatchHistory] Error:', error);
            this.setErrorMessage('Failed to load match history.');
            this.matchHistory = [];
            return [];
        }
    };


    @action
    loadRunesReforged = async () => {
        const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/14.3.1/data/en_US/runesReforged.json`)
        this.runesReforged = await response.json()
    }

    @action
    fetchAverageRank = async (match: MatchData, apiKey: string) => {
        try {
            // Step 1: Extract PUUIDs of all participants from the match
            const participantPuuids = match.info.participants.map((p) => p.puuid)

            // Step 2: Fetch ranked data for each participant
            const rankedDataArray = await fetchMatchRankedData(participantPuuids, apiKey)

            // Step 3: Convert ranked data to numeric scores using rankToScore mapping
            const scores: number[] = rankedDataArray.map((entry) => {
                if (!entry || !entry.tier) return 0

                const tier = entry.tier.toUpperCase()
                const division = entry.rank?.toUpperCase() || ''

                // Step 3a: Use just tier for high-rank players; otherwise, combine tier + division
                const key = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier) ? tier : `${tier} ${division}`

                // Step 3b: Convert to numeric score using rankToScore map
                return rankToScore[key] ?? 0
            })

            // Step 4: Filter out scores that are 0 (unranked or unknown)
            const validScores = scores.filter((score) => score > 0)

            // Step 5: If no valid scores, default to "Unranked"
            if (validScores.length === 0) {
                this.averageRank = 'Unranked'
                return
            }

            // Step 6: Calculate average rank score
            const averageScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length

            // Step 7: Round to nearest rank score
            const roundedScore = Math.round(averageScore)

            // Step 8: Build a reverse lookup (score -> rank label)
            const scoreToRank = Object.entries(rankToScore).reduce<Record<number, string>>((acc, [rank, score]) => {
                acc[score] = rank
                return acc
            }, {})

            // Step 9: Set the average rank based on the score, or fallback to "Unranked"
            this.averageRank = scoreToRank[roundedScore] || 'Unranked'
            console.log('[Average Rank]', this.averageRank)
        } catch (error) {
            // Step 11: On error, log and fallback to "Unranked"
            console.error('[fetchAverageRank] Error:', error)
            this.averageRank = 'Unranked'
        }
    }

    @action
    handleToggle = (matchId: string) => {
        this.flippedMatches[matchId] = !this.flippedMatches[matchId]
    }

    @action
    handleSectionChange = (section: string) => {
        this.selectedSection = section;
    }

    // Convert angle to radians for path calculations
    //  This code converts angles to coordinates to draw a donut chart segment:
    // - angleToRadians turns degrees into radians for math calculations.
    // - getPath calculates the points for a segment's outer and inner arcs:
    //   - Uses startAngle and endAngle to determine the segment's size.
    //   - outerRadius and innerRadius set the donut's thickness.
    //   - cx and cy are the center point of the chart.
    //   - largeArcFlag decides if the arc is more or less than half a circle.
    //   - Returns an SVG path string connecting these points to form a filled shape.

    @action
    generateDonutChart(blueValue: number, redValue: number) {
        const total = blueValue + redValue;

        // Calculate angles
        const blueAngle = total > 0 ? (blueValue / total) * 360 : 0;
        const redAngle = total > 0 ? (redValue / total) * 360 : 0;

        const angleToRadians = (angle: number) => (angle * Math.PI) / 180;

        const getPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number, cx: number, cy: number) => {
            const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
            const startX = cx + outerRadius * Math.cos(angleToRadians(startAngle - 90));
            const startY = cy + outerRadius * Math.sin(angleToRadians(startAngle - 90));
            const endX = cx + outerRadius * Math.cos(angleToRadians(endAngle - 90));
            const endY = cy + outerRadius * Math.sin(angleToRadians(endAngle - 90));
            const innerStartX = cx + innerRadius * Math.cos(angleToRadians(endAngle - 90));
            const innerStartY = cy + innerRadius * Math.sin(angleToRadians(endAngle - 90));
            const innerEndX = cx + innerRadius * Math.cos(angleToRadians(startAngle - 90));
            const innerEndY = cy + innerRadius * Math.sin(angleToRadians(startAngle - 90));

            return `
      M ${startX},${startY}
      A ${outerRadius},${outerRadius},0,${largeArcFlag},1,${endX},${endY}
      L ${innerStartX},${innerStartY}
      A ${innerRadius},${innerRadius},0,${largeArcFlag},0,${innerEndX},${innerEndY}
      Z
    `;
        };

        return {
            bluePath: getPath(0, blueAngle, 45, 33, 45, 45),
            redPath: getPath(blueAngle, blueAngle + redAngle, 45, 33, 45, 45),
            blueValue: blueValue.toLocaleString(),
            redValue: redValue.toLocaleString()
        };
    }

    render() {

        return (
            <div className="contentContainer">

                <div className="searchContainer">
                    <input
                        className="inputContainer"
                        type="text"
                        value={this.summonerName}
                        onChange={this.handleInputChange}
                        placeholder="Enter Riot ID (e.g., Player#NA1)"
                    />
                    <button className="buttonSearch" onClick={this.handleSearch}>
                        Search
                    </button>
                </div>
                {this.errorMessage && (
                    <div className="errorMessageContainer">
                        <p style={{ color: 'red', marginTop: '8px' }}>{this.errorMessage}</p>
                    </div>
                )}
                {this.summonerData && (
                    <div className="accountDetailsContainer">
                        <div className="accountDetails">
                            <div className="summonerDisplay">
                                {/* Display Profile Icon */}
                                <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/12.21.1/img/profileicon/${this.summonerData.profileIconId}.png`}
                                    alt={`${this.summonerData.name}'s profile`}
                                    className="summonerIcon"
                                />
                                <div className="summonerLevel">{this.summonerData.summonerLevel}</div>
                            </div>
                        </div>

                        <div className="summonerName">{this.summonerName}</div>
                    </div>
                )}
                {
                    this.isLoading ? (
                        <div className="matchHistory">
                            <h3>Loading match history...</h3>
                        </div>
                    ) : this.matchHistory.length > 0 ? (
                        <div className="matchHistory">
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

                                const searchedParticipant = match.info.participants.find(
                                    (player: any) => player.puuid === this.summonerData?.puuid,
                                )

                                return (
                                    <div key={index} className="matchCard">
                                        <div className="matchCardDisplayWrapper">
                                            <div className="matchCardDisplay">
                                                <div className={`frontalCard ${searchedParticipant?.win ? 'win' : 'loss'}`}></div>
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
                                                                <div className="graySpan">{searchedParticipant.win ? 'Victory' : 'Defeat'}</div>
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
                                                                        <div className="championSpriteLevel">{searchedParticipant.champLevel}</div>
                                                                    </div>
                                                                    <div className="SummonerSpellAndRunesContainer">
                                                                        <div className="SummonerSpellContainer">
                                                                            {/* Define spell1Name and spell2Name here */}
                                                                            {searchedParticipant && (
                                                                                <>
                                                                                    {(() => {
                                                                                        const spell1Name = summonerSpellIdMap[searchedParticipant.summoner1Id]
                                                                                        const spell2Name = summonerSpellIdMap[searchedParticipant.summoner2Id]

                                                                                        // Define URLs for spell icons
                                                                                        const spell1Url = spell1Name
                                                                                            ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell1Name}.png`
                                                                                            : '/fallback-icon.png' // Fallback if spell is missing
                                                                                        const spell2Url = spell2Name
                                                                                            ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell2Name}.png`
                                                                                            : '/fallback-icon.png' // Fallback if spell is missing

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
                                                                                        )
                                                                                    })()}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        <div className="RunesContainer">
                                                                            <img
                                                                                src={this.getRunePerkIconURL(
                                                                                    searchedParticipant.perks.styles[0].style,
                                                                                    searchedParticipant.perks.styles[0].selections[0].perk,
                                                                                )}
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
                                                                            {searchedParticipant.kills} /{' '}
                                                                            <span className="death-text">{searchedParticipant.deaths}</span> /{' '}
                                                                            {searchedParticipant.assists}
                                                                        </div>
                                                                        <div className="KDAComparison">
                                                                            {(() => {
                                                                                const { kills, assists, deaths } = searchedParticipant
                                                                                const kdaValue = deaths === 0 ? kills + assists : (kills + assists) / deaths
                                                                                return `${kdaValue.toFixed(2)} : 1 KDA`
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                    {/* Kill Participation Display */}
                                                                    <div className="KPCSRankContainer">
                                                                        <div className="KPScore">
                                                                            {(() => {
                                                                                // Find participant index (used to infer team)
                                                                                const participantIndex = match.info.participants.findIndex(
                                                                                    (p) => p.puuid === searchedParticipant.puuid,
                                                                                )

                                                                                const isTeamOne = participantIndex < 5

                                                                                // Get team kills
                                                                                const teamKills = match.info.participants
                                                                                    .filter((_, idx) => (isTeamOne ? idx < 5 : idx >= 5))
                                                                                    .reduce((sum, p) => sum + p.kills, 0)

                                                                                // Calculate KP
                                                                                const playerKP =
                                                                                    teamKills > 0
                                                                                        ? ((searchedParticipant.kills + searchedParticipant.assists) / teamKills) * 100
                                                                                        : 0

                                                                                return `P/Kill ${playerKP.toFixed(0)}%`
                                                                            })()}
                                                                        </div>
                                                                        <div className="CScore">
                                                                            {searchedParticipant.totalMinionsKilled + searchedParticipant.neutralMinionsKilled}
                                                                            &nbsp;(
                                                                            {(
                                                                                (searchedParticipant.totalMinionsKilled + searchedParticipant.neutralMinionsKilled) /
                                                                                (match.info.gameDuration / 60)
                                                                            ).toFixed(1)}
                                                                            {' '}
                                                                            CS/min)
                                                                        </div>
                                                                        <div
                                                                            className="AverageMatchRank"
                                                                            style={{ color: getTierColor(this.averageRank) }}
                                                                        >
                                                                            Average Rank: {this.averageRank || 'Unranked'}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="items">
                                                                    {[
                                                                        searchedParticipant.item0,
                                                                        searchedParticipant.item1,
                                                                        searchedParticipant.item2,
                                                                        searchedParticipant.item3,
                                                                        searchedParticipant.item4,
                                                                        searchedParticipant.item5,
                                                                        searchedParticipant.item6,
                                                                    ].map((itemId, itemIndex) => {
                                                                        if (itemId !== 0) {
                                                                            const itemImageUrl = getItemImageUrl(itemId)
                                                                            return (
                                                                                <img
                                                                                    key={itemIndex}
                                                                                    src={itemImageUrl}
                                                                                    alt={`Item ${itemId}`}
                                                                                    width="22"
                                                                                    height="22"
                                                                                />
                                                                            )
                                                                        } else {
                                                                            return (
                                                                                <div
                                                                                    key={itemIndex}
                                                                                    className={`itemPlaceholder ${searchedParticipant.win ? 'win' : 'loss'}`}
                                                                                />
                                                                            )
                                                                        }
                                                                    })}
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
                                                                    <span className="participantName" title={player.riotIdGameName}>
                                                                        {player.riotIdGameName}
                                                                    </span>
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
                                                                    <span className="participantName" title={player.riotIdGameName}>
                                                                        {player.riotIdGameName}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="displayMatchDetailsButtonContainer">
                                                    <button className={`matchDetailsButton ${searchedParticipant?.win ? 'win' : 'loss'}`} onClick={() => this.handleToggle(match.metadata.matchId)}>
                                                        <svg
                                                            className={`arrowIcon ${searchedParticipant?.win ? 'win' : 'loss'} ${this.flippedMatches[match.metadata.matchId] ? 'flipped' : ''}`}
                                                            viewBox="0 0 24 24"
                                                            width="20"
                                                            height="20"
                                                            fill="currentColor"
                                                        >
                                                            <path
                                                                fillRule="nonzero"
                                                                d="M12 13.2 16.5 9l1.5 1.4-6 5.6-6-5.6L7.5 9z"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div
                                                className={`expandedMatchDetails ${this.flippedMatches[match.metadata.matchId] ? 'open' : ''} ${this.flippedMatches[match.metadata.matchId]
                                                    ? `${this.selectedSection.charAt(0).toLowerCase() + this.selectedSection.slice(1).replace(/\s+/g, '')}Section`
                                                    : ''
                                                    }`}
                                                style={{
                                                }}
                                            >
                                                <div className="expandedMatchDetailsSectionsWrapper">
                                                    {['Overview', 'Iv Score', 'Team analysis', 'Build', 'Etc.'].map((section) => (
                                                        <button
                                                            key={section}
                                                            className={
                                                                this.selectedSection === section
                                                                    ? 'expandedMatchDetailsSectionsSelected'
                                                                    : 'expandedMatchDetailsSections'
                                                            }
                                                            onClick={() => this.handleSectionChange(section)}
                                                        >
                                                            {section}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="sectionContentWrapper">
                                                    {this.selectedSection === 'Overview' && (
                                                        <div className="OverviewTeamHeaderWrapper">
                                                            <table className="championMatchDetailsTableBlue">
                                                                <colgroup>
                                                                    <col style={{ width: 'auto' }} />    {/* Victory */}
                                                                    <col style={{ width: '68px' }} />    {/* IV Score */}
                                                                    <col style={{ width: '98px' }} />    {/* KDA */}
                                                                    <col style={{ width: '120px' }} />   {/* Damage */}
                                                                    <col style={{ width: '48px' }} />    {/* Wards */}
                                                                    <col style={{ width: '56px' }} />    {/* CS */}
                                                                    <col style={{ width: '175px' }} />   {/* Items */}
                                                                </colgroup>

                                                                <thead>
                                                                    <tr className={`OverviewTeamHeaderRow ${match.info.participants[0].win ? 'win' : 'loss'}`}>
                                                                        <th scope="col">
                                                                            {match.info.participants[0].win ? 'Victory (Blue Team)' : 'Defeat (Blue Team)'}
                                                                        </th>
                                                                        <th scope="col">IV Score</th>
                                                                        <th scope="col">KDA</th>
                                                                        <th scope="col">Damage</th>
                                                                        <th scope="col">Wards</th>
                                                                        <th scope="col">CS</th>
                                                                        <th scope="col">Items</th>
                                                                    </tr>
                                                                </thead>

                                                                <tbody>
                                                                    {match.info.participants.slice(0, 5).map(participant => {
                                                                        const teamKills = match.info.participants
                                                                            .slice(0, 5)
                                                                            .reduce((sum, p) => sum + p.kills, 0);
                                                                        const playerKP = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) * 100 : 0
                                                                        const playerKPFormatted = ` (${playerKP.toFixed(0)}%)`

                                                                        const mostDamageOnTeam = Math.max(...match.info.participants.slice(0, 5).map(p => p.totalDamageDealtToChampions))
                                                                        const mostDamageTakenOnTeam = Math.max(...match.info.participants.slice(0, 5).map(p => p.totalDamageTaken))

                                                                        return <SummonerMatchDetailCard
                                                                            participant={participant}
                                                                            getRunePerkIconURL={this.getRunePerkIconURL}
                                                                            getRuneStyleIconURL={this.getRuneStyleIconURL}
                                                                            playerKP={playerKPFormatted}
                                                                            mostDamageOnTeam={mostDamageOnTeam}
                                                                            mostDamageTakenOnTeam={mostDamageTakenOnTeam}
                                                                            gameMinutes={match.info.gameDuration / 60}
                                                                        />
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                            {/* Objectives Display*/}
                                                            <div className='matchDetailsObjectiveDisplay'>
                                                                <div className='objectivesBlueSide'>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M9 10a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m-2-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0m5-10 2 4-1 1H9L8 4 7 5H5L4 4l2-4-6 4 2 4 3 8 1-1h4l1 1 3-8 2-4z"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconBaronBlue">{match.info.teams[0].objectives.baron.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 0 6 4 3 1v4H0l3 3v3l4 5h2l4-5V8l3-3h-3V1l-3 3zm1 11 1-2 2-1-1 2zM4 8l1 2 2 1-1-2z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconDragonBlue">{match.info.teams[0].objectives.dragon.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M14.286 11.387c1.219.552 1.714 1.599 1.714 1.599-1.155 2.232-2.581 2.351-2.755 2.357h-.018c.345-.39 1.059-3.956 1.059-3.956m-12.572 0s.713 3.565 1.058 3.956c0 0-1.541.023-2.772-2.357 0 0 .494-1.047 1.714-1.6M11.238 1s4.44 2.576 3.75 7.845c0 0-2.048.345-2.163 1.886 0 0-.85 3.382-4.762 3.52H7.93c-3.91-.138-4.762-3.52-4.762-3.52-.115-1.541-2.163-1.886-2.163-1.886C.314 3.576 4.754 1 4.754 1c-1.157 3.41.03 4.182.152 4.25l.01.006c1.09-.805 2.125-1.095 3.032-1.12q.024-.004.048-.002l.048-.002c.907.029 1.942.319 3.033 1.124 0 0 1.38-.667.16-4.256m-.127 7.638c.023-2.83-3.04-2.588-3.163-2.578-.123-.01-3.186-.252-3.163 2.578 0 0 .023 3.393 3.094 3.68h.138c3.07-.287 3.094-3.68 3.094-3.68M7.993 7.073c.571 0 1.034.94 1.034 2.102 0 1.16-.463 2.1-1.034 2.1-.57 0-1.034-.94-1.034-2.1s.463-2.102 1.034-2.102"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconRiftHeraldBlue">{match.info.teams[0].objectives.riftHerald.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M8 0 6.476 3.048l.508 2.54L8 7.11l1.016-1.524.508-2.54zM6.476 5.587l-.508-2.031-2.031-1.524v2.031L2.413 5.587v1.016h1.016L4.952 5.08z" />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M4.444 6.095 8 8.127l3.556-2.032 1.015 1.016.508 1.524.508-1.524L16 6.603l-3.429 6.095-1.015 2.54-1.016-1.016v-1.524l-1.524 1.016H6.984L5.46 12.698v1.524l-1.016 1.016-1.015-2.54L0 6.603l2.413.508.508 1.524.508-1.524zm2.032 3.556.508 1.524-2.032-1.016-.508-1.524zm3.048 0-.508 1.524 2.032-1.016.508-1.524z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m9.524 5.587.508-2.031 2.031-1.524v2.031l1.524 1.524v1.016h-1.016L11.048 5.08z" />
                                                                        </svg>
                                                                        <span className="iconAtakhanBlue">{match.info.teams[0].objectives.atakhan.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 1 6.333 2.42s-.87.798-1.151.798H3.928c-.928 0-2.261.978-2.557 2.68-.074.429-.098 1.282.56 2.168L1 8.812s1.333.71 1.667 2.131C3 12.363 5.088 13.704 6.9 14.088l1.08.881V15L8 14.985l.019.015v-.031l1.08-.881c1.813-.384 3.901-1.724 4.234-3.145.334-1.42 1.667-2.13 1.667-2.13l-.931-.747c.658-.886.637-1.726.56-2.169-.296-1.701-1.629-2.68-2.557-2.68h-1.254c-.28 0-1.151-.797-1.151-.797zm.149 3.245a.2.2 0 0 0-.298 0L5.434 6.93a.2.2 0 0 0 .021.29c.275.228.818.687 1.007.914.21.255-1.316 1.405-1.862 1.804a.202.202 0 0 0-.026.304l1.84 1.88a.2.2 0 0 0 .285 0l1.158-1.183a.2.2 0 0 1 .286 0L9.3 12.122a.2.2 0 0 0 .286 0l1.84-1.88a.202.202 0 0 0-.026-.304c-.546-.399-2.073-1.549-1.862-1.804.189-.227.732-.686 1.007-.913a.2.2 0 0 0 .021-.29z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconVoidGrubBlue">{match.info.teams[0].objectives.horde.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m12 8-2 8H6L4 8l4 4zM8 0l4 4-1.003 1.002L11 5h3l-6 6-6-6h2.999L4 4zm0 2.4L6.4 4 8 5.6 9.6 4z" />
                                                                        </svg>
                                                                        <span className="iconTurretBlue">{match.info.teams[0].objectives.tower.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemBlue">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14m0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12"
                                                                                clipRule="evenodd"
                                                                            />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m8 4 4 4-4 4-4-4z" />
                                                                        </svg>
                                                                        <span className="iconInhibitorBlue">{match.info.teams[0].objectives.inhibitor.kills}</span>
                                                                    </li>
                                                                </div>
                                                                <div className="totalTeamStats">
                                                                    {/* Calculate totals */}
                                                                    {(() => {
                                                                        const blueTeam = match.info.participants.slice(0, 5);
                                                                        const redTeam = match.info.participants.slice(5);

                                                                        const blueKills = blueTeam.reduce((sum, p) => sum + p.kills, 0);
                                                                        const redKills = redTeam.reduce((sum, p) => sum + p.kills, 0);
                                                                        const totalKills = blueKills + redKills;

                                                                        const blueGold = blueTeam.reduce((sum, p) => sum + p.goldEarned, 0);
                                                                        const redGold = redTeam.reduce((sum, p) => sum + p.goldEarned, 0);
                                                                        const totalGold = blueGold + redGold;

                                                                        // Calculate percentages for bar widths
                                                                        const blueKillPercent = totalKills > 0 ? (blueKills / totalKills) * 100 : 50;
                                                                        const blueGoldPercent = totalGold > 0 ? (blueGold / totalGold) * 100 : 50;

                                                                        return (
                                                                            <>
                                                                                {/* Kills Graph (Top) */}
                                                                                <div className="graphRow">
                                                                                    <div className="graphBarContainer">
                                                                                        <div
                                                                                            className="graphBar blueBar"
                                                                                            style={{ width: `${blueKillPercent}%` }}
                                                                                        >
                                                                                            <span className="graphValue">{blueKills}</span>
                                                                                        </div>
                                                                                        <div className="graphTitle">Total Kills</div>
                                                                                        <div
                                                                                            className="graphBar redBar"
                                                                                            style={{ width: `${100 - blueKillPercent}%` }}
                                                                                        >
                                                                                            <span className="graphValue">{redKills}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Gold Graph (Bottom) */}
                                                                                <div className="graphRow">
                                                                                    <div className="graphBarContainer">
                                                                                        <div
                                                                                            className="graphBar blueBar"
                                                                                            style={{ width: `${blueGoldPercent}%` }}
                                                                                        >
                                                                                            <span className="graphValue">{(blueGold / 1000).toFixed(1)}k</span>
                                                                                        </div>
                                                                                        <div className="graphTitle">Total Gold</div>
                                                                                        <div
                                                                                            className="graphBar redBar"
                                                                                            style={{ width: `${100 - blueGoldPercent}%` }}
                                                                                        >
                                                                                            <span className="graphValue">{(redGold / 1000).toFixed(1)}k</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                <div className='objectivesRedSide'>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M9 10a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m-2-2a1 1 0 1 1 2 0 1 1 0 0 1-2 0m5-10 2 4-1 1H9L8 4 7 5H5L4 4l2-4-6 4 2 4 3 8 1-1h4l1 1 3-8 2-4z"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconBaronRed">{match.info.teams[1].objectives.baron.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 0 6 4 3 1v4H0l3 3v3l4 5h2l4-5V8l3-3h-3V1l-3 3zm1 11 1-2 2-1-1 2zM4 8l1 2 2 1-1-2z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconDragonRed">{match.info.teams[1].objectives.dragon.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M14.286 11.387c1.219.552 1.714 1.599 1.714 1.599-1.155 2.232-2.581 2.351-2.755 2.357h-.018c.345-.39 1.059-3.956 1.059-3.956m-12.572 0s.713 3.565 1.058 3.956c0 0-1.541.023-2.772-2.357 0 0 .494-1.047 1.714-1.6M11.238 1s4.44 2.576 3.75 7.845c0 0-2.048.345-2.163 1.886 0 0-.85 3.382-4.762 3.52H7.93c-3.91-.138-4.762-3.52-4.762-3.52-.115-1.541-2.163-1.886-2.163-1.886C.314 3.576 4.754 1 4.754 1c-1.157 3.41.03 4.182.152 4.25l.01.006c1.09-.805 2.125-1.095 3.032-1.12q.024-.004.048-.002l.048-.002c.907.029 1.942.319 3.033 1.124 0 0 1.38-.667.16-4.256m-.127 7.638c.023-2.83-3.04-2.588-3.163-2.578-.123-.01-3.186-.252-3.163 2.578 0 0 .023 3.393 3.094 3.68h.138c3.07-.287 3.094-3.68 3.094-3.68M7.993 7.073c.571 0 1.034.94 1.034 2.102 0 1.16-.463 2.1-1.034 2.1-.57 0-1.034-.94-1.034-2.1s.463-2.102 1.034-2.102"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconRiftHeraldRed">{match.info.teams[1].objectives.riftHerald.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="M8 0 6.476 3.048l.508 2.54L8 7.11l1.016-1.524.508-2.54zM6.476 5.587l-.508-2.031-2.031-1.524v2.031L2.413 5.587v1.016h1.016L4.952 5.08z" />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M4.444 6.095 8 8.127l3.556-2.032 1.015 1.016.508 1.524.508-1.524L16 6.603l-3.429 6.095-1.015 2.54-1.016-1.016v-1.524l-1.524 1.016H6.984L5.46 12.698v1.524l-1.016 1.016-1.015-2.54L0 6.603l2.413.508.508 1.524.508-1.524zm2.032 3.556.508 1.524-2.032-1.016-.508-1.524zm3.048 0-.508 1.524 2.032-1.016.508-1.524z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m9.524 5.587.508-2.031 2.031-1.524v2.031l1.524 1.524v1.016h-1.016L11.048 5.08z" />
                                                                        </svg>
                                                                        <span className="iconAtakhanRed">{match.info.teams[1].objectives.atakhan.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 1 6.333 2.42s-.87.798-1.151.798H3.928c-.928 0-2.261.978-2.557 2.68-.074.429-.098 1.282.56 2.168L1 8.812s1.333.71 1.667 2.131C3 12.363 5.088 13.704 6.9 14.088l1.08.881V15L8 14.985l.019.015v-.031l1.08-.881c1.813-.384 3.901-1.724 4.234-3.145.334-1.42 1.667-2.13 1.667-2.13l-.931-.747c.658-.886.637-1.726.56-2.169-.296-1.701-1.629-2.68-2.557-2.68h-1.254c-.28 0-1.151-.797-1.151-.797zm.149 3.245a.2.2 0 0 0-.298 0L5.434 6.93a.2.2 0 0 0 .021.29c.275.228.818.687 1.007.914.21.255-1.316 1.405-1.862 1.804a.202.202 0 0 0-.026.304l1.84 1.88a.2.2 0 0 0 .285 0l1.158-1.183a.2.2 0 0 1 .286 0L9.3 12.122a.2.2 0 0 0 .286 0l1.84-1.88a.202.202 0 0 0-.026-.304c-.546-.399-2.073-1.549-1.862-1.804.189-.227.732-.686 1.007-.913a.2.2 0 0 0 .021-.29z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                        </svg>
                                                                        <span className="iconVoidGrubRed">{match.info.teams[1].objectives.horde.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m12 8-2 8H6L4 8l4 4zM8 0l4 4-1.003 1.002L11 5h3l-6 6-6-6h2.999L4 4zm0 2.4L6.4 4 8 5.6 9.6 4z" />
                                                                        </svg>
                                                                        <span className="iconTurretRed">{match.info.teams[1].objectives.tower.kills}</span>
                                                                    </li>
                                                                    <li className="iconListItemRed">
                                                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="evenodd"
                                                                                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14m0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12"
                                                                                clipRule="evenodd"
                                                                            />
                                                                            <path
                                                                                fill="currentColor"
                                                                                fillRule="nonzero"
                                                                                d="m8 4 4 4-4 4-4-4z" />
                                                                        </svg>

                                                                        <span className="iconInhibitorRed">{match.info.teams[1].objectives.inhibitor.kills}</span>
                                                                    </li>
                                                                </div>
                                                            </div>

                                                            <table className="championMatchDetailsTableRed">
                                                                <colgroup>
                                                                    <col style={{ width: 'auto' }} />    {/* Victory */}
                                                                    <col style={{ width: '68px' }} />    {/* IV Score */}
                                                                    <col style={{ width: '98px' }} />    {/* KDA */}
                                                                    <col style={{ width: '120px' }} />   {/* Damage */}
                                                                    <col style={{ width: '48px' }} />    {/* Wards */}
                                                                    <col style={{ width: '56px' }} />    {/* CS */}
                                                                    <col style={{ width: '175px' }} />   {/* Items */}
                                                                </colgroup>

                                                                <thead>
                                                                    <tr className={`OverviewTeamHeaderRow ${match.info.participants[5].win ? 'win' : 'loss'}`}>
                                                                        <th scope="col">
                                                                            {match.info.participants[5].win ? 'Victory (Red Team)' : 'Defeat (Red Team)'}
                                                                        </th>
                                                                        <th scope="col">IV Score</th>
                                                                        <th scope="col">KDA</th>
                                                                        <th scope="col">Damage</th>
                                                                        <th scope="col">Wards</th>
                                                                        <th scope="col">CS</th>
                                                                        <th scope="col">Items</th>
                                                                    </tr>
                                                                </thead>

                                                                <tbody>
                                                                    {match.info.participants.slice(5, 10).map((participant, index) => {
                                                                        const spell1Name = summonerSpellIdMap[participant.summoner1Id];
                                                                        const spell2Name = summonerSpellIdMap[participant.summoner2Id];

                                                                        const spell1Url = spell1Name
                                                                            ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell1Name}.png`
                                                                            : '/fallback-icon.png';

                                                                        const spell2Url = spell2Name
                                                                            ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${spell2Name}.png`
                                                                            : '/fallback-icon.png';

                                                                        return (
                                                                            <tr
                                                                                key={index}
                                                                                className={`championMatchDetailsCard ${participant.win ? 'win' : 'loss'}`}
                                                                            >
                                                                                <td key={participant.puuid}>
                                                                                    <div className="championMatchDetailsInfoContainer">
                                                                                        <div className="spriteMatchDetailsContainer">
                                                                                            <img
                                                                                                className="championMatchDetailsSprite"
                                                                                                src={`https://ddragon.leagueoflegends.com/cdn/15.6.1/img/champion/${participant.championName}.png`}
                                                                                                alt={`${participant.championName} Sprite`}
                                                                                                width="32"
                                                                                                height="32"
                                                                                            />
                                                                                            <div className="championMatchDetailsSpriteLevel">{participant.champLevel}</div>
                                                                                        </div>

                                                                                        <div className="SummonerMatchDetailsSpellAndRunesContainer">
                                                                                            <div className="SummonerSpellContainer">
                                                                                                <img
                                                                                                    src={spell1Url}
                                                                                                    alt={`Summoner Spell 1 - ${spell1Name}`}
                                                                                                    width="16"
                                                                                                    height="16"
                                                                                                />
                                                                                                <img
                                                                                                    src={spell2Url}
                                                                                                    alt={`Summoner Spell 2 - ${spell2Name}`}
                                                                                                    width="16"
                                                                                                    height="16"
                                                                                                />
                                                                                            </div>
                                                                                            <div className="RunesContainer">
                                                                                                <img
                                                                                                    src={this.getRunePerkIconURL(
                                                                                                        participant.perks.styles[0].style,
                                                                                                        participant.perks.styles[0].selections[0].perk
                                                                                                    )}
                                                                                                    alt="Keystone Rune"
                                                                                                    width="16"
                                                                                                    height="16"
                                                                                                />
                                                                                                <img
                                                                                                    src={this.getRuneStyleIconURL(
                                                                                                        participant.perks.styles[1].style
                                                                                                    )}
                                                                                                    alt="Secondary Rune Style"
                                                                                                    width="16"
                                                                                                    height="16"
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="summonerMatchDetailsWrapper">
                                                                                            <div className="summonerMatchDetailsName">
                                                                                                {participant.riotIdGameName ?? 'Unknown'}
                                                                                            </div>
                                                                                            <div className="summonerMatchDetailsLevel">
                                                                                                Level {participant.summonerLevel ?? '-'}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td> <div className="ivScoreMatchDetailsContainer"></div></td>
                                                                                <td>
                                                                                    <div className="KDAMatchDetailsContainer">
                                                                                        <div className="KDAScoreMatchDetails">
                                                                                            {participant.kills} /{" "}
                                                                                            <span className="deathCount">{participant.deaths}</span> /{" "}
                                                                                            {participant.assists}
                                                                                            <span className="KPScoreMatchDetails">
                                                                                                {(() => {
                                                                                                    const teamKills = match.info.participants
                                                                                                        .slice(0, 5)
                                                                                                        .reduce((sum, p) => sum + p.kills, 0);
                                                                                                    const playerKP =
                                                                                                        teamKills > 0
                                                                                                            ? ((participant.kills + participant.assists) / teamKills) * 100
                                                                                                            : 0;
                                                                                                    return ` (${playerKP.toFixed(0)}%)`;
                                                                                                })()}
                                                                                            </span>
                                                                                        </div>

                                                                                        <div className="KDAComparisonMatchDetails">
                                                                                            {(() => {
                                                                                                const { kills, assists, deaths } = participant;
                                                                                                const kdaValue = deaths === 0 ? kills + assists : (kills + assists) / deaths;
                                                                                                return `${kdaValue.toFixed(2)} : 1 KDA`;
                                                                                            })()}
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <div className='damageDealtMatchDetailsWrapper' title={`Damage dealt to champions ${participant.totalDamageDealtToChampions.toLocaleString()}`}>
                                                                                        <div className='damageDealtMatchDetails'>
                                                                                            {participant.totalDamageDealtToChampions.toLocaleString()}
                                                                                        </div>
                                                                                        <div className='damageDealtMatchDetailsBar' style={{
                                                                                            width: `${(participant.totalDamageDealtToChampions / Math.max(...match.info.participants.slice(0, 5).map(p => p.totalDamageDealtToChampions))) * 100}%`
                                                                                        }}></div>
                                                                                    </div>

                                                                                    <div className='damageDealtMatchDetailsWrapper' title={`Damage taken ${participant.totalDamageTaken.toLocaleString()}`}>
                                                                                        <div className='damageTakenMatchDetails'>
                                                                                            {participant.totalDamageTaken.toLocaleString()}
                                                                                        </div>
                                                                                        <div className='damageTakenMatchDetailsBar' style={{
                                                                                            width: `${(participant.totalDamageTaken / Math.max(...match.info.participants.slice(0, 5).map(p => p.totalDamageTaken))) * 100}%`
                                                                                        }}></div>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <div className='wardsMatchDetailsContainer'>
                                                                                        <div className='pinkWardsMatchDetails'>
                                                                                            {participant.detectorWardsPlaced}
                                                                                        </div>
                                                                                        <div className='wardsMatchDetails'>
                                                                                            {participant.wardsPlaced} / {participant.wardsKilled}
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <div className='CSMatchDetailsContainer'>
                                                                                        <div className='CSTotalMatchDetails'>
                                                                                            {participant.totalMinionsKilled + participant.neutralMinionsKilled}

                                                                                        </div>
                                                                                        <div className='CSCalculationMatchDetails'>
                                                                                            &nbsp;
                                                                                            {(
                                                                                                (participant.totalMinionsKilled + participant.neutralMinionsKilled) /
                                                                                                (match.info.gameDuration / 60)
                                                                                            ).toFixed(1)}
                                                                                            /m
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <div className='itemsMatchDetailsContainer'>
                                                                                        <div className="itemsMatchDetailsContainer">
                                                                                            <div className="items">
                                                                                                {[
                                                                                                    participant.item0,
                                                                                                    participant.item1,
                                                                                                    participant.item2,
                                                                                                    participant.item3,
                                                                                                    participant.item4,
                                                                                                    participant.item5,
                                                                                                    participant.item6,
                                                                                                ].map((itemId, index) => (
                                                                                                    itemId !== 0 ? (
                                                                                                        <img
                                                                                                            key={index}
                                                                                                            src={getItemImageUrl(itemId)}
                                                                                                            alt={`Item ${itemId}`}
                                                                                                            width="22"
                                                                                                            height="22"
                                                                                                        />
                                                                                                    ) : (
                                                                                                        <div
                                                                                                            key={index}
                                                                                                            className={`itemPlaceholder ${participant.win ? 'win' : 'loss'}`}
                                                                                                        />
                                                                                                    )
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>

                                                            {/* Divider */}
                                                            <div className={`matchDetailsDivider ${!match.info.participants[0].win ? 'win' : 'loss'}`}></div>
                                                        </div>

                                                    )}
                                                    {this.selectedSection === 'Iv Score' && (
                                                        <div className="IvScoreWrapper">

                                                        </div>
                                                    )}
                                                    {this.selectedSection === 'Team analysis' && (
                                                        <div className="TeamAnalysisWrapper">
                                                            <div className="TeamAnalysisHeader">
                                                                <button className='matchAnalysisHeader'>Match Details</button>
                                                                <button className='timelineHeader'>Timeline</button>
                                                            </div>
                                                            <div className='TeamAnalysisLegend'>
                                                                <div className='winningTeamLegend'>
                                                                    <em className='winningTeamLegendDot'></em>
                                                                    <span className='spanLegend'>Winning Team</span>
                                                                </div>
                                                                <div className='losingTeamLegend'>
                                                                    <em className='losingTeamLegendDot'></em>
                                                                    <span className='spanLegend'>Losing Team</span>
                                                                </div>
                                                            </div>

                                                            <div className="grid-container">
                                                                {/* Item 1: Kills */}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">Kills</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => (
                                                                                <div key={`blue-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.kills / Math.max(...match.info.participants.map(p => p.kills))) * 100)}%`,
                                                                                                    background: 'rgb(83, 131, 232)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.kills.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>

                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueTeamKills = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.kills, 0);
                                                                                const redTeamKills = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.kills, 0);

                                                                                return (
                                                                                    <>
                                                                                        {(() => {
                                                                                            const chart = this.generateDonutChart(blueTeamKills, redTeamKills);
                                                                                            return (
                                                                                                <>
                                                                                                    <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                                        <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                                        <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                                        <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                                    </svg>
                                                                                                    <div className="displayTeamStatsContainer">
                                                                                                        <div className="blueTeamStats">
                                                                                                            {blueTeamKills.toLocaleString()}
                                                                                                        </div>
                                                                                                        <span className="separatorBar"></span>
                                                                                                        <div className="redTeamStats">
                                                                                                            {redTeamKills.toLocaleString()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="redTeamDisplayStatistics">
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => (
                                                                                <div key={`red-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.kills / Math.max(...match.info.participants.map(p => p.kills))) * 100)}%`,
                                                                                                    background: 'rgb(232, 64, 87)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.kills.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Item 2 : Gold */}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">Gold</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => (
                                                                                <div key={`blue-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.goldEarned / Math.max(...match.info.participants.map(p => p.goldEarned))) * 100)}%`,
                                                                                                    background: 'rgb(83, 131, 232)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.goldEarned.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueTeamGold = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.goldEarned, 0);
                                                                                const redTeamGold = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.goldEarned, 0);

                                                                                return (
                                                                                    <>
                                                                                        {(() => {
                                                                                            const chart = this.generateDonutChart(blueTeamGold, redTeamGold);
                                                                                            return (
                                                                                                <>
                                                                                                    <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                                        <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                                        <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                                        <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                                    </svg>
                                                                                                    <div className="displayTeamStatsContainer">
                                                                                                        <div className="blueTeamStats">
                                                                                                            {blueTeamGold.toLocaleString()}
                                                                                                        </div>
                                                                                                        <span className="separatorBar"></span>
                                                                                                        <div className="redTeamStats">
                                                                                                            {redTeamGold.toLocaleString()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="redTeamDisplayStatistics">
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => (
                                                                                <div key={`red-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.goldEarned / Math.max(...match.info.participants.map(p => p.goldEarned))) * 100)}%`,
                                                                                                    background: 'rgb(232, 64, 87)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.goldEarned.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Item 3 : Damage Dealt */}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">Damage</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => (
                                                                                <div key={`blue-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.totalDamageDealtToChampions / Math.max(...match.info.participants.map(p => p.totalDamageDealtToChampions))) * 100)}%`,
                                                                                                    background: 'rgb(83, 131, 232)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.totalDamageDealtToChampions.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>

                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueDamageDealt = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.totalDamageDealtToChampions, 0);
                                                                                const redDamageDealt = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.totalDamageDealtToChampions, 0);

                                                                                return (
                                                                                    <>
                                                                                        {(() => {
                                                                                            const chart = this.generateDonutChart(blueDamageDealt, redDamageDealt);
                                                                                            return (
                                                                                                <>
                                                                                                    <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                                        <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                                        <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                                        <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                                    </svg>
                                                                                                    <div className="displayTeamStatsContainer">
                                                                                                        <div className="blueTeamStats">
                                                                                                            {blueDamageDealt.toLocaleString()}
                                                                                                        </div>
                                                                                                        <span className="separatorBar"></span>
                                                                                                        <div className="redTeamStats">
                                                                                                            {redDamageDealt.toLocaleString()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>

                                                                        <div className="redTeamDisplayStatistics">
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => (
                                                                                <div key={`red-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.totalDamageDealtToChampions / Math.max(...match.info.participants.map(p => p.totalDamageDealtToChampions))) * 100)}%`,
                                                                                                    background: 'rgb(232, 64, 87)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.totalDamageDealtToChampions.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Item 4 : Wards Placed */}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">Wards Placed</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => (
                                                                                <div key={`blue-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.wardsPlaced / Math.max(...match.info.participants.map(p => p.wardsPlaced))) * 100)}%`,
                                                                                                    background: 'rgb(83, 131, 232)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.wardsPlaced.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueWardsPlaced = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.wardsPlaced, 0);
                                                                                const redWardsPlaced = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.wardsPlaced, 0);

                                                                                return (
                                                                                    <>
                                                                                        {(() => {
                                                                                            const chart = this.generateDonutChart(blueWardsPlaced, redWardsPlaced);
                                                                                            return (
                                                                                                <>
                                                                                                    <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                                        <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                                        <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                                        <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                                    </svg>
                                                                                                    <div className="displayTeamStatsContainer">
                                                                                                        <div className="blueTeamStats">
                                                                                                            {blueWardsPlaced.toLocaleString()}
                                                                                                        </div>
                                                                                                        <span className="separatorBar"></span>
                                                                                                        <div className="redTeamStats">
                                                                                                            {redWardsPlaced.toLocaleString()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="redTeamDisplayStatistics">
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => (
                                                                                <div key={`red-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.wardsPlaced / Math.max(...match.info.participants.map(p => p.wardsPlaced))) * 100)}%`,
                                                                                                    background: 'rgb(232, 64, 87)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.wardsPlaced.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Item 5 : Damage Taken */}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">Damage taken</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => (
                                                                                <div key={`blue-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.totalDamageTaken / Math.max(...match.info.participants.map(p => p.totalDamageTaken))) * 100)}%`,
                                                                                                    background: 'rgb(83, 131, 232)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.totalDamageTaken.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueDamageTaken = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.totalDamageTaken, 0);
                                                                                const redDamageTaken = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.totalDamageTaken, 0);

                                                                                return (
                                                                                    <>
                                                                                        {(() => {
                                                                                            const chart = this.generateDonutChart(blueDamageTaken, redDamageTaken);
                                                                                            return (
                                                                                                <>
                                                                                                    <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                                        <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                                        <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                                        <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                                    </svg>
                                                                                                    <div className="displayTeamStatsContainer">
                                                                                                        <div className="blueTeamStats">
                                                                                                            {blueDamageTaken.toLocaleString()}
                                                                                                        </div>
                                                                                                        <span className="separatorBar"></span>
                                                                                                        <div className="redTeamStats">
                                                                                                            {redDamageTaken.toLocaleString()}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="redTeamDisplayStatistics">
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => (
                                                                                <div key={`red-${idx}`} className="participantItem">
                                                                                    <img
                                                                                        src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                        alt={player.championName}
                                                                                        className="championIcon"
                                                                                        width="16"
                                                                                        height="16"
                                                                                    />
                                                                                    <div className="participantStatContainer">
                                                                                        <div className="participantStat">
                                                                                            <div
                                                                                                className="teamStatsBar"
                                                                                                style={{
                                                                                                    width: `${Math.min(100, (player.totalDamageTaken / Math.max(...match.info.participants.map(p => p.totalDamageTaken))) * 100)}%`,
                                                                                                    background: 'rgb(232, 64, 87)'
                                                                                                }}
                                                                                            >
                                                                                            </div>
                                                                                            <div className='participantStatDisplay'>{player.totalDamageTaken.toLocaleString()}</div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Item 6 : CS*/}
                                                                <div className="grid-item">
                                                                    <div className="sectionHeader">CS</div>
                                                                    <div className="TeamAnalysisSection">
                                                                        <div className="blueTeamDisplayStatistics">
                                                                            {/* Blue Team CS Display */}
                                                                            {match.info.participants.slice(0, 5).map((player, idx) => {
                                                                                const creepScore = player.totalMinionsKilled + player.neutralMinionsKilled;
                                                                                const maxCS = Math.max(...match.info.participants.map(p =>
                                                                                    p.totalMinionsKilled + p.neutralMinionsKilled
                                                                                ));

                                                                                return (
                                                                                    <div key={`blue-${idx}`} className="participantItem">
                                                                                        <img
                                                                                            src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                            alt={player.championName}
                                                                                            className="championIcon"
                                                                                            width="16"
                                                                                            height="16"
                                                                                        />
                                                                                        <div className="participantStatContainer">
                                                                                            <div className="participantStat">
                                                                                                <div
                                                                                                    className="teamStatsBar"
                                                                                                    style={{
                                                                                                        width: `${Math.min(100, (creepScore / maxCS) * 100)}%`,
                                                                                                        background: 'rgb(83, 131, 232)'
                                                                                                    }}
                                                                                                ></div>
                                                                                                <div className='participantStatDisplay'>{creepScore.toLocaleString()}</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                        <div className="graphComparisonStatistics">
                                                                            {(() => {
                                                                                const blueCreepScore = match.info.participants
                                                                                    .slice(0, 5)
                                                                                    .reduce((sum, player) => sum + player.totalMinionsKilled + player.neutralMinionsKilled, 0);

                                                                                const redCreepScore = match.info.participants
                                                                                    .slice(5, 10)
                                                                                    .reduce((sum, player) => sum + player.totalMinionsKilled + player.neutralMinionsKilled, 0);

                                                                                const chart = this.generateDonutChart(blueCreepScore, redCreepScore);

                                                                                return (
                                                                                    <>
                                                                                        <svg width="90" height="90" viewBox="0 0 90 90" className="donut-chart">
                                                                                            <circle cx="45" cy="45" r="45" fill="none" stroke="#2d3748" strokeWidth="6" />
                                                                                            <path d={chart.bluePath} fill="rgb(83, 131, 232)" stroke="none" />
                                                                                            <path d={chart.redPath} fill="rgb(232, 83, 83)" stroke="none" />
                                                                                        </svg>
                                                                                        <div className="displayTeamStatsContainer">
                                                                                            <div className="blueTeamStats">
                                                                                                {blueCreepScore.toLocaleString()}
                                                                                            </div>
                                                                                            <span className="separatorBar"></span>
                                                                                            <div className="redTeamStats">
                                                                                                {redCreepScore.toLocaleString()}
                                                                                            </div>
                                                                                        </div>
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="redTeamDisplayStatistics">
                                                                            {/* Red Team CS Display */}
                                                                            {match.info.participants.slice(5, 10).map((player, idx) => {
                                                                                const creepScore = player.totalMinionsKilled + player.neutralMinionsKilled;
                                                                                const maxCS = Math.max(...match.info.participants.map(p =>
                                                                                    p.totalMinionsKilled + p.neutralMinionsKilled
                                                                                ));

                                                                                return (
                                                                                    <div key={`red-${idx}`} className="participantItem">
                                                                                        <img
                                                                                            src={`https://ddragon.leagueoflegends.com/cdn/14.7.1/img/champion/${player.championName}.png`}
                                                                                            alt={player.championName}
                                                                                            className="championIcon"
                                                                                            width="16"
                                                                                            height="16"
                                                                                        />
                                                                                        <div className="participantStatContainer">
                                                                                            <div className="participantStat">
                                                                                                <div
                                                                                                    className="teamStatsBar"
                                                                                                    style={{
                                                                                                        width: `${Math.min(100, (creepScore / maxCS) * 100)}%`,
                                                                                                        background: 'rgb(232, 64, 87)'
                                                                                                    }}
                                                                                                ></div>
                                                                                                <div className='participantStatDisplay'>{creepScore.toLocaleString()}</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {this.selectedSection === 'Build' && (
                                                        <div className="BuildWrapper">

                                                        </div>
                                                    )}
                                                    {this.selectedSection === 'Etc.' && (
                                                        <div className="EtcWrapper">

                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <hr />
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="matchHistory">
                            <h3>No match history found.</h3>
                        </div>
                    )
                }
                <Link to={`/`}>GO TO HOME</Link>
            </div >
        );
    }
}
