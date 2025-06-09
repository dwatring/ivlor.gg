/* eslint-disable prettier/prettier */
import React from 'react'
import './SummonerSearch.css'
import { makeObservable, observable, action } from 'mobx'
import { observer } from 'mobx-react'
import { Link } from 'react-router-dom'
import Bottleneck from 'bottleneck'

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

const getItemImageUrl = (itemId: number) => {
    // Use the item ID to generate the URL for the item's image
    return `https://ddragon.leagueoflegends.com/cdn/15.6.1/img/item/${itemId}.png`
}

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

const summonerSpellIdMap: { [id: number]: string } = {
    1: 'SummonerBoost', // Ghost
    3: 'SummonerExhaust', // Exhaust
    4: 'SummonerFlash', // Flash
    6: 'SummonerHaste', // Haste
    7: 'SummonerHeal', // Heal
    11: 'SummonerSmite', // Smite
    12: 'SummonerTeleport', // Teleport
    13: 'SummonerMana', // Clarity
    14: 'SummonerDot', // Ignite
    21: 'SummonerBarrier', // Barrier
    32: 'SummonerSnowball', // Snowball
    39: 'SummonerChillingSmite', // Chilling Smite
    55: 'SummonerPoroRecall', // Poro Recall
    56: 'SummonerMark', // Mark (used by Kindred)
    57: 'SummonerPoroThrow', // Poro Throw
    59: 'SummonerPoroCoin', // Poro Coin
    61: 'SummonerShurimaRecall', // Shurima Recall
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
        participants: {
            riotIdGameName: string
            puuid: string
            doublekill: number
            triplekill: number
            quadrakill: number
            pentakill: number
            kills: number
            assists: number
            deaths: number
            item0: number
            item1: number
            item2: number
            item3: number
            item4: number
            item5: number
            item6: number
            championName: string
            champLevel: number
            totalMinionsKilled: number
            win: boolean
            summoner1Id: number //ADDED VARIABLE
            summoner2Id: number //ADDED VARIABLE

            perks: {
                statPerks: {
                    defense: number
                    flex: number
                    offense: number
                }
                styles: {
                    description: string
                    style: number
                    selections: {
                        perk: number
                        var1: number
                        var2: number
                        var3: number
                    }[]
                }[]
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
                `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=2`,
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
                                // Split participants into two groups
                                const firstFiveParticipants = match.info.participants.slice(0, 5)
                                const secondFiveParticipants = match.info.participants.slice(5, 10)

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
                                                                            CS {searchedParticipant.totalMinionsKilled}
                                                                            &nbsp;(
                                                                            {(searchedParticipant.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(
                                                                                1,
                                                                            )}{' '}
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
                                            <div className={`expandedMatchDetails ${this.flippedMatches[match.metadata.matchId] ? 'open' : ''}`}>
                                                <div className="expandedMatchDetailsSectionsWrapper">
                                                    <button className='expandedMatchDetailsSectionsOverview'>Overview</button>
                                                </div>
                                            </div>
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
                                                                    {[
                                                                        player.item0,
                                                                        player.item1,
                                                                        player.item2,
                                                                        player.item3,
                                                                        player.item4,
                                                                        player.item5,
                                                                        player.item6,
                                                                    ].map((itemId, itemIndex) => {
                                                                        if (itemId !== 0) {
                                                                            // Only display item if itemId is not 0
                                                                            const itemImageUrl = getItemImageUrl(itemId)
                                                                            return (
                                                                                <img
                                                                                    key={itemIndex}
                                                                                    src={itemImageUrl}
                                                                                    alt={`Item ${itemId}`}
                                                                                    width="30"
                                                                                    height="30"
                                                                                />
                                                                            )
                                                                        }
                                                                        return null
                                                                    })}
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    <ul className="participantsColumn">
                                                        {secondFiveParticipants.map((player, idx) => (
                                                            <li key={idx + 5}>
                                                                {' '}
                                                                {/* Use idx + 5 to avoid key conflicts */}
                                                                {player.riotIdGameName}
                                                                {/* Display item images */}
                                                                <div className="items">
                                                                    {[
                                                                        player.item0,
                                                                        player.item1,
                                                                        player.item2,
                                                                        player.item3,
                                                                        player.item4,
                                                                        player.item5,
                                                                        player.item6,
                                                                    ].map((itemId, itemIndex) => {
                                                                        if (itemId !== 0) {
                                                                            // Only display item if itemId is not 0
                                                                            const itemImageUrl = getItemImageUrl(itemId)
                                                                            return (
                                                                                <img
                                                                                    key={itemIndex}
                                                                                    src={itemImageUrl}
                                                                                    alt={`Item ${itemId}`}
                                                                                    width="30"
                                                                                    height="30"
                                                                                />
                                                                            )
                                                                        }
                                                                        return null
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
