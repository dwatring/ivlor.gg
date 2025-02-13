import React from 'react'
import './ChampionList.css'
import { action, computed, makeObservable, observable } from 'mobx'
import { observer } from 'mobx-react'
import { Link } from 'react-router-dom'

@observer
export default class ChampionList extends React.Component {
  constructor(props: {}) {
    super(props)
    makeObservable(this)
  }

  @observable
  champions: any[] = []
  @observable
  searchQuery: string = ""
  @computed
  get filteredChampions() {
    const localFilter: any[] = []

    for (let i = 0; i < this.champions.length; i++) {
      let a: string = ""
      let b: string = ""



      a = this.champions[i].name
      b = this.searchQuery

      a = a.toLowerCase()
      b = b.toLowerCase()

      if (a.includes(b) && ((this.getChampionsFromRole(this.roleSelected).includes(this.champions[i].name)) || this.roleSelected == "All")) {
        localFilter.push(this.champions[i])
      }
    }
    return localFilter
  }

  @observable
  role: string = ""
  @observable
  roleSelected: string = "All"

  intialPopulateList() {
    const items = []
    for (let i = 0; i < this.champions.length; i++) {
      items.push(<ChampionListItem key={this.champions[i].name} name={this.champions[i].name} id={this.champions[i].id} />)
    }
    return items
  }

  searchQueryPopulateList() {
    const items = []
    for (let i = 0; i < this.filteredChampions.length; i++) {
      items.push(<ChampionListItem key={this.filteredChampions[i].name} name={this.filteredChampions[i].name} id={this.filteredChampions[i].id} />)
    }
    return items
  }

  async getChampionsFromAPI() {
    try {
      let response = await fetch('https://ddragon.leagueoflegends.com/cdn/14.15.1/data/en_US/champion.json');
      let responseJson = await response.json();
      this.champions = Object.values(responseJson.data).sort((a: any, b: any) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error(error)
    }
  }

  componentDidMount(): void {
    this.getChampionsFromAPI();
  }

  setInput(championInput: string) {
    this.searchQuery = championInput
  }

  assignRoles(roles: string) {
    this.roleSelected = roles
  }

  assignFreeChampions() {

  }
  // Hardcoded since name isnt apart of riot API champions - 8/20/24
  getChampionsFromRole(role: string) {

    if (role === "Top") {
      const topChampions =
        ["Aatrox",
          "Akali",
          "Aurora",
          "Camille",
          "Cassiopeia",
          "Cho'Gath",
          "Darius",
          "Dr. Mundo",
          "Fiora",
          "Gangplank",
          "Garen",
          "Gnar",
          "Gragas",
          "Gwen",
          "Heimerdinger",
          "Illaoi",
          "Irelia",
          "Jax",
          "Jayce",
          "K'Sante",
          "Kayle",
          "Kennen",
          "Kled",
          "Malphite",
          "Mordekaiser",
          "Naafiri",
          "Nasus",
          "Olaf",
          "Ornn",
          "Pantheon",
          "Poppy",
          "Quinn",
          "Renekton",
          "Riven",
          "Rumble",
          "Ryze",
          "Sett",
          "Shen",
          "Singed",
          "Sion",
          "Smolder",
          "Sylas",
          "Tahm Kench",
          "Teemo",
          "Trundle",
          "Tryndamere",
          "Udyr",
          "Urgot",
          "Varus",
          "Vayne",
          "Vladimir",
          "Volibear",
          "Warwick",
          "Wukong",
          "Yasuo",
          "Yone",
          "Yorick",
          "Zac",]
      return topChampions
    }
    if (role === "Jng") {
      const jungleChampions = [
        "Amumu",
        "Bel'Veth",
        "Brand",
        "Briar",
        "Diana",
        "Ekko",
        "Elise",
        "Evelynn",
        "Fiddlesticks",
        "Gragas",
        "Graves",
        "Gwen",
        "Hecarim",
        "Ivern",
        "Ivern",
        "Jarvan IV",
        "Jax",
        "Karthus",
        "Kayn",
        "Kha'Zix",
        "Kindred",
        "Lee Sin",
        "Lillia",
        "Maokai",
        "Master Yi",
        "Morgana",
        "Nidalee",
        "Nocturn",
        "Nunu & Willump",
        "Poppy",
        "Qiyana",
        "Rammus",
        "Rek'Sai",
        "Rengar",
        "Sejuani",
        "Shaco",
        "Shyvana",
        "Skarner",
        "Sylas",
        "Taliyah",
        "Talon",
        "Udyr",
        "Vi",
        "Viego",
        "Volibear",
        "Warwick",
        "Wukong",
        "Xin Zhao",
        "Zac",
        "Zed",
        "Zyra",]
      return jungleChampions
    }
    if (role === "Mid") {
      const midChampions = [
        "Ahri",
        "Akali",
        "Akshan",
        "Anivia",
        "Annie",
        "Aurelion Sol",
        "Aurora",
        "Brand",
        "Cassiopeia",
        "Corki",
        "Diana",
        "Ekko",
        "Fizz",
        "Galio",
        "Gragas",
        "Hwei",
        "Irelia",
        "Jayce",
        "Kassadin",
        "Katarina",
        "Kayle",
        "Kennen",
        "Leblanc",
        "Lissandra",
        "Lucian",
        "Lux",
        "Malphite",
        "Malzahar",
        "Naafiri",
        "Nasus",
        "Neeko",
        "Orianna",
        "Pantheon",
        "Qiyana",
        "Quinn",
        "Renekton",
        "Rumble",
        "Ryze",
        "Smolder",
        "Swain",
        "Sylas",
        "Syndra",
        "Taliyah",
        "Talon",
        "Tristana",
        "Twisted Fate",
        "Varus",
        "Veigar",
        "Vel'Koz",
        "Vex",
        "Viktor",
        "Vladimir",
        "Xerath",
        "Yasuo",
        "Yone",
        "Zed",
        "Zeri",
        "Ziggs",
        "Zoe",]
      return midChampions
    }
    if (role === "Bot") {
      const botChampions = ["Aphelios",
        "Ashe",
        "Brand",
        "Caitlyn",
        "Draven",
        "Ezreal",
        "Jhin",
        "Jinx",
        "Kai'Sa",
        "Kalista",
        "Karthus",
        "Kog'Maw",
        "Lucian",
        "Miss Fortune",
        "Nilah",
        "Samira",
        "Seraphine",
        "Sivir",
        "Smolder",
        "Swain",
        "Tristana",
        "Twitch",
        "Varus",
        "Vayne",
        "Xayah",
        "Zeri",
        "Ziggs",]
      return botChampions
    }
    if (role === "Sup") {
      const supChampions = ["Alistar",
        "Amumu",
        "Bard",
        "Blitzcrank",
        "Brand",
        "Braum",
        "Camille",
        "Fiddlesticks",
        "Hwei",
        "Janna",
        "Karma",
        "LeBlanc",
        "Leona",
        "Lulu",
        "Lux",
        "Maokai",
        "Milio",
        "Morgana",
        "Nami",
        "Nautilus",
        "Neeko",
        "Pantheon",
        "Poppy",
        "Pyke",
        "Rakan",
        "Rell",
        "Renata Glasc",
        "Senna",
        "Seraphine",
        "Alistar",
        "Shaco",
        "Shen",
        "Sona",
        "Soraka",
        "Swain",
        "Tahm Kench",
        "Taric",
        "Thresh",
        "Vel'Koz",
        "Xerath",
        "Yuumi",
        "Zac",
        "Zilean",
        "Zyra",]
      return supChampions
    }
    return []


  }



  render() {
    return (
      <div className="backgroundContainer">
        <div className="championSearch">
          <div className="championSearchInputContainer">
            <img className="searchIcon" src={"https://s-lol-web.op.gg/images/icon/icon-search-dark.svg"}></img>
            <input type="text" className="championSearchInput" placeholder="Search a champion" value={this.searchQuery} onChange={(e) => this.setInput(e.target.value)}></input>
          </div>
        </div>

        <div className="roleContainer">
          <button type="button" className={this.roleSelected === 'All' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("All")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-all-dark.svg" alt="All" /></button>
          <button type="button" className={this.roleSelected === 'Top' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Top")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-top-dark.svg" alt="Top" /></button>
          <button type="button" className={this.roleSelected === 'Jng' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Jng")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-jng-dark.svg" alt="Jungle" /></button>
          <button type="button" className={this.roleSelected === 'Mid' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Mid")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-mid-dark.svg" alt="Mid" /></button>
          <button type="button" className={this.roleSelected === 'Bot' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Bot")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-bot-dark.svg" alt="Bot" /></button>
          <button type="button" className={this.roleSelected === 'Sup' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Sup")}><img src="https://s-lol-web.op.gg/images/icon/icon-position-sup-dark.svg" alt="Support" /></button>
          <button type="button" className={this.roleSelected === 'Free' ? "button buttonActive" : "button buttonInactive"} onClick={() => this.assignRoles("Free")}><img src="https://s-lol-web.op.gg/images/icon/icon-rotation-dark.svg" alt="Free" /></button>
        </div>

        <div>
          <div className="foregroundContainer">
            {this.searchQuery.length > 0 || this.roleSelected !== "All" ? this.searchQueryPopulateList() : null}
            {this.searchQuery.length === 0 && this.roleSelected === "All" ? this.intialPopulateList() : null}
          </div>
        </div>
      </div>
    )
  }
}

interface ChampionListItemProps {
  name: string
  id: string
}

export class ChampionListItem extends React.Component<ChampionListItemProps> {
  render() {
    return (
      <Link style={{ textDecoration: 'none' }} to={`/champions/` + this.props.id}>

        <div className="championDiv">
          <img className="championContainer" src={"https://ddragon.leagueoflegends.com/cdn/14.15.1/img/champion/" + this.props.id + ".png"}></img>
          <p className="championName">{this.props.name}</p>
        </div>

      </Link>

    )
  }
}
