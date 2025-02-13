import { makeObservable, observable } from 'mobx'
import { observer } from 'mobx-react'
import React from 'react'
import { Link } from 'react-router-dom'

@observer
export default class SingleChampionPage extends React.Component {
  constructor(props: {}) {
    super(props)
    makeObservable(this)
  }

  @observable
  championID = window.location.href.split('champions/')[1]
  @observable
  champion = { name: "" }

  async getChampionsFromAPI() {
    try {
      let response = await fetch('https://ddragon.leagueoflegends.com/cdn/14.15.1/data/en_US/champion/' + this.championID + '.json');
      let responseJson = await response.json();
      this.champion = responseJson.data[this.championID]
      console.log(responseJson.data)
    } catch (error) {
      console.error(error)
    }
  }

  componentDidMount(): void {
    this.getChampionsFromAPI();
  }


  render() {
    return (

      <div>
        <p>{this.champion.name}</p>
        <Link to={`/champions`}>CHANGE PAGE</Link>
      </div>
      //
    )
  }
}
