import React from 'react'
import './ChampionList.css'
import { action, computed, makeObservable, observable } from 'mobx'
import { observer } from 'mobx-react'
import { getItemImageUrl, summonerSpellIdMap } from '../lib/constants'
import { Participant } from '../lib/interfaces'

interface Props {
  participant: Participant
  getRunePerkIconURL: (styleId: number, perkId: number) => string
  getRuneStyleIconURL: (styleId: number) => string
  playerKP: string
  mostDamageOnTeam: number
  mostDamageTakenOnTeam: number
  gameMinutes: number
}

@observer
export default class SummonerMatchDetailCard extends React.Component<Props> {
  constructor(props: Props) {
    super(props)
    makeObservable(this)
  }

  spell1Name = summonerSpellIdMap[this.props.participant.summoner1Id]

  spell2Name = summonerSpellIdMap[this.props.participant.summoner2Id]

  spell1Url = this.spell1Name ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${this.spell1Name}.png` : '/fallback-icon.png'

  spell2Url = this.spell2Name ? `https://ddragon.leagueoflegends.com/cdn/13.6.1/img/spell/${this.spell2Name}.png` : '/fallback-icon.png'

  render() {
    return (
      <tr
        key={`summoner-match-detail-card-${this.props.participant.puuid}`}
        className={`championMatchDetailsCard ${this.props.participant.win ? 'win' : 'loss'}`}
      >
        <td key={this.props.participant.puuid}>
          <div className="championMatchDetailsInfoContainer">
            <div className="spriteMatchDetailsContainer">
              <img
                className="championMatchDetailsSprite"
                src={`https://ddragon.leagueoflegends.com/cdn/15.6.1/img/champion/${this.props.participant.championName}.png`}
                alt={`${this.props.participant.championName} Sprite`}
                width="32"
                height="32"
              />
              <div className="championMatchDetailsSpriteLevel">{this.props.participant.champLevel}</div>
            </div>

            <div className="SummonerMatchDetailsSpellAndRunesContainer">
              <div className="SummonerSpellContainer">
                <img
                  src={this.spell1Url}
                  alt={`Summoner Spell 1 - ${this.spell1Name}`}
                  width="16"
                  height="16"
                />
                <img
                  src={this.spell2Url}
                  alt={`Summoner Spell 2 - ${this.spell2Name}`}
                  width="16"
                  height="16"
                />
              </div>
              <div className="RunesContainer">
                <img
                  src={this.props.getRunePerkIconURL(
                    this.props.participant.perks.styles[0].style,
                    this.props.participant.perks.styles[0].selections[0].perk
                  )}
                  alt="Keystone Rune"
                  width="16"
                  height="16"
                />
                <img
                  src={this.props.getRuneStyleIconURL(
                    this.props.participant.perks.styles[1].style
                  )}
                  alt="Secondary Rune Style"
                  width="16"
                  height="16"
                />
              </div>
            </div>
            <div className="summonerMatchDetailsWrapper">
              <div className="summonerMatchDetailsName">
                {this.props.participant.riotIdGameName ?? 'Unknown'}
              </div>
              <div className="summonerMatchDetailsLevel">
                Level {this.props.participant.summonerLevel ?? '-'}
              </div>
            </div>
          </div>
        </td>
        <td> <div className="ivScoreMatchDetailsContainer"></div></td>
        <td>
          <div className="KDAMatchDetailsContainer">
            <div className="KDAScoreMatchDetails">
              {this.props.participant.kills} /{" "}
              <span className="deathCount">{this.props.participant.deaths}</span> /{" "}
              {this.props.participant.assists}
              <span className="KPScoreMatchDetails">
                {this.props.playerKP}
              </span>
            </div>

            <div className="KDAComparisonMatchDetails">
              {(() => {
                const { kills, assists, deaths } = this.props.participant;
                const kdaValue = deaths === 0 ? kills + assists : (kills + assists) / deaths;
                return `${kdaValue.toFixed(2)} : 1 KDA`;
              })()}
            </div>
          </div>
        </td>
        <td>
          <div className='damageDealtMatchDetailsWrapper' title={`Damage dealt to champions ${this.props.participant.totalDamageDealtToChampions.toLocaleString()}`}>
            <div className='damageDealtMatchDetails'>
              {this.props.participant.totalDamageDealtToChampions.toLocaleString()}
            </div>
            <div className='damageDealtMatchDetailsBar' style={{
              width: `${(this.props.participant.totalDamageDealtToChampions / this.props.mostDamageOnTeam) * 100}%`
            }}></div>
          </div>

          <div className='damageDealtMatchDetailsWrapper' title={`Damage taken ${this.props.participant.totalDamageTaken.toLocaleString()}`}>
            <div className='damageTakenMatchDetails'>
              {this.props.participant.totalDamageTaken.toLocaleString()}
            </div>
            <div className='damageTakenMatchDetailsBar' style={{
              width: `${(this.props.participant.totalDamageTaken / this.props.mostDamageTakenOnTeam) * 100}%`
            }}></div>
          </div>
        </td>
        <td>
          <div className='wardsMatchDetailsContainer'>
            <div className='pinkWardsMatchDetails'>
              {this.props.participant.detectorWardsPlaced}
            </div>
            <div className='wardsMatchDetails'>
              {this.props.participant.wardsPlaced} / {this.props.participant.wardsKilled}
            </div>
          </div>
        </td>
        <td>
          <div className='CSMatchDetailsContainer'>
            <div className='CSTotalMatchDetails'>
              {this.props.participant.totalMinionsKilled + this.props.participant.neutralMinionsKilled}

            </div>
            <div className='CSCalculationMatchDetails'>
              &nbsp;
              {(
                (this.props.participant.totalMinionsKilled + this.props.participant.neutralMinionsKilled) /
                (this.props.gameMinutes)
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
                  this.props.participant.item0,
                  this.props.participant.item1,
                  this.props.participant.item2,
                  this.props.participant.item3,
                  this.props.participant.item4,
                  this.props.participant.item5,
                  this.props.participant.item6,
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
                      className={`itemPlaceholder ${this.props.participant.win ? 'win' : 'loss'}`}
                    />
                  )
                ))}
              </div>
            </div>
          </div>
        </td>
      </tr>
    )
  }
}