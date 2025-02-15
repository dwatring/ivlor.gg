import React from 'react'
import ChampionList from '../components/ChampionList'
import { Link } from 'react-router-dom'

export default class ChampionPage extends React.Component {
  render() {
    return (
      <div>
        <ChampionList />
        <Link to={`/`}>GO TO HOME</Link>
      </div>

    )
  }
}
