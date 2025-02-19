import React from 'react';
import './SummonerSearch.css';
import { makeObservable, observable, action } from 'mobx';
import { observer } from 'mobx-react';
import { Link } from 'react-router-dom';

interface SummonerData {
    id: string;
    accountId: string;
    puuid: string;
    name: string;
    profileIconId: number;
    summonerLevel: number;
}

@observer
export default class SummonerSearch extends React.Component {
    @observable summonerName: string = '';
    @observable summonerData: SummonerData | null = null;
    @observable errorMessage: string = '';

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
            // Step 1: Get PUUID using Riot ID
            const accountResponse = await fetch(
                `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`,
                {
                    headers: {
                        'X-Riot-Token': apiKey,
                    },
                }
            );

            if (!accountResponse.ok) {
                throw new Error('Riot ID not found. Please check the name and tag.');
            }

            const accountData = await accountResponse.json();
            const puuid = accountData.puuid;

            // Step 2: Get Summoner V4 details using PUUID
            const summonerResponse = await fetch(
                `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
                {
                    headers: {
                        'X-Riot-Token': apiKey,
                    },
                }
            );

            if (!summonerResponse.ok) {
                throw new Error('Failed to retrieve summoner data.');
            }

            const summonerData: SummonerData = await summonerResponse.json();
            this.summonerData = summonerData;
            this.errorMessage = '';
        } catch (error) {
            this.errorMessage = 'Error fetching summoner data. Try again later.';
            console.error('Error fetching summoner data:', error);
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
                        <p>PUUID: {this.summonerData.puuid}</p>
                        <p>Profile Icon ID: {this.summonerData.profileIconId}</p>
                        <img
                            src={`http://ddragon.leagueoflegends.com/cdn/14.3.1/img/profileicon/${this.summonerData.profileIconId}.png`}
                            alt="Profile Icon"
                            width="100"
                            height="100"
                        />
                    </div>
                )}

                <Link to={`/`}>GO TO HOME</Link>
            </div>
        );
    }
}
