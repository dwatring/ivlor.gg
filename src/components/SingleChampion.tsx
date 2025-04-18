import { makeObservable, observable } from 'mobx'
import { observer } from 'mobx-react'
import React from 'react'
import { Link } from 'react-router-dom'
import './SingleChampion.css'
interface Skin {
  num: number
  id: string
  name: string
  chromas?: boolean
}

@observer
export default class SingleChampion extends React.Component {
  constructor(props: Record<string, never>) {
    super(props)
    makeObservable(this)
  }

  @observable
  championID = window.location.href.split('champions/')[1]

  @observable
  champion = {
    name: '',
    title: '',
    tags: [],
    image: { full: '' },
    blurb: '',
    skins: [] as Skin[], // Skins are stored as an array
    spells: [] as { id: string; name: string }[], // Spells are stored as an array
    passive: { name: '', image: { full: '' } },
    info: {
      attack: 0,
      defense: 0,
      magic: 0,
      difficulty: 0,
    },
    stats: {
      hp: 0,
      hpperlevel: 0,
      mp: 0,
      mpperlevel: 0,
      movespeed: 0,
      armor: 0,
      armorperlevel: 0,
      spellblock: 0,
      spellblockperlevel: 0,
      attackrange: 0,
      hpregen: 0,
      hpregenperlevel: 0,
      mpregen: 0,
      mpregenperlevel: 0,
      crit: 0,
      critperlevel: 0,
      attackdamage: 0,
      attackdamageperlevel: 0,
      attackspeedperlevel: 0,
      attackspeed: 0,
    },
  }

  async getChampionsFromAPI() {
    try {
      // Fetch champion data from Data Dragon
      const response = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/14.15.1/data/en_US/champion/${this.championID}.json`,
      )
      const responseJson = await response.json()

      // Extract champion data
      const championData = responseJson.data[this.championID]

      // Update the champion observable
      this.champion = {
        name: championData.name,
        title: championData.title,
        tags: championData.tags,
        image: championData.image,
        blurb: championData.blurb,
        passive: {
          name: championData.passive.name,
          image: championData.passive.image,
        },
        skins: championData.skins.map((skin: any) => ({
          // Correct the variable name and ensure the correct properties
          num: skin.num,
          id: skin.id,
          name: skin.name,
          chromas: skin.chromas,
        })),
        spells: championData.spells.map((spell: any) => ({
          id: spell.id,
          name: spell.name,
        })),
        info: championData.info,
        stats: championData.stats,
      }

      console.log('Champion Data:', championData)
    } catch (error) {
      console.error('Error fetching champion data:', error)
    }
  }

  componentDidMount() {
    this.getChampionsFromAPI()
  }

  render() {
    const { name, title, tags, image, blurb, skins, spells, passive, info, stats } = this.champion
    const blurImageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${image.full.replace('.png', '_0.jpg')}`

    return (
      <div className="championWrapper">
        {/* Champion Card (separate and first) */}
        <div className="backgroundContainer">
          <div className="foregroundContainer">
            <div className="nameContainer">{name}</div>
            <div className="titleContainer">{title}</div>
            <img className="imgContainer" src={blurImageUrl} alt={`${name} blur`} />

            <div className="tagsContainer">
              <strong>Tags:</strong>
              <ul className="tagsList">
                {tags.map((tag, index) => (
                  <li className="tagItem" key={index}>
                    {tag}
                  </li>
                ))}
              </ul>
            </div>

            <p className="blurbText">{blurb}</p>
          </div>

          <Link className="changePageLink" to="/champions">
            RETURN TO CHAMPION LIST
          </Link>
        </div>

        {/* Skin Container (contains Skins, Spells, Info, and Stats sections) */}
        <div className="skinContainer">
          {/* Skins Section */}
          <div className="skinSection">
            <h3 className="skinTitleDisplay">Skins</h3>
            <div className="skins">
              {skins
                .filter((skin) => skin.num !== 0) // Exclude the default skin
                .map((skin) => (
                  <div key={skin.id} className="skinCard">
                    <img
                      src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${this.championID}_${skin.num}.jpg`}
                      alt={`${name} ${skin.name}`}
                      className="skinImage"
                    />
                    <p className="skinName">{skin.name}</p>
                    {skin.chromas && <span className="chromaIndicator">Chromas Available</span>}
                  </div>
                ))}
            </div>
          </div>

          {/* Abilities Section (Passive + Spells) */}
          <div className="spellsContainer">
            <h3 className="spellsTitleDisplay">Abilities</h3>
            <div className="spells">
              {/* Passive Ability */}
              <div className="spellCard passiveCard">
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/15.3.1/img/passive/${passive.image.full}`}
                  alt={passive.name}
                  className="spellImage"
                />
                <p className="spellName">{passive.name} (Passive)</p>
              </div>
              {/* Spells */}
              {spells.map((spell) => (
                <div key={spell.id} className="spellCard">
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/15.3.1/img/spell/${spell.id}.png`}
                    alt={spell.name}
                    className="spellImage"
                  />
                  <p className="spellName">{spell.name}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="infoContainer">
            <h3 className="infoTitleDisplay">Info</h3>
            <div className="infoGrid">
              <div className="infoItem">
                <strong>Attack:</strong> {info.attack}
              </div>
              <div className="infoItem">
                <strong>Defense:</strong> {info.defense}
              </div>
              <div className="infoItem">
                <strong>Magic:</strong> {info.magic}
              </div>
              <div className="infoItem">
                <strong>Difficulty:</strong> {info.difficulty}
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="statsContainer">
            <h3 className="statsTitleDisplay">Stats</h3>
            <div className="statsGrid">
              <div className="statsItem">
                <strong>HP:</strong> {stats.hp} (+{stats.hpperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>MP:</strong> {stats.mp} (+{stats.mpperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Move Speed:</strong> {stats.movespeed}
              </div>
              <div className="statsItem">
                <strong>Armor:</strong> {stats.armor} (+{stats.armorperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Spell Block:</strong> {stats.spellblock} (+{stats.spellblockperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Attack Range:</strong> {stats.attackrange}
              </div>
              <div className="statsItem">
                <strong>HP Regen:</strong> {stats.hpregen} (+{stats.hpregenperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>MP Regen:</strong> {stats.mpregen} (+{stats.mpregenperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Crit:</strong> {stats.crit} (+{stats.critperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Attack Damage:</strong> {stats.attackdamage} (+{stats.attackdamageperlevel} per level)
              </div>
              <div className="statsItem">
                <strong>Attack Speed:</strong> {stats.attackspeed} (+{stats.attackspeedperlevel} per level)
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
