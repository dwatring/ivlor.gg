import React from 'react'
import './ChampionList.css'
import { makeObservable } from 'mobx'
import { observer } from 'mobx-react'

export default class ChampionList extends React.Component {
  render() {
    return (
      <div>
        <ChampionListItem key={'Thresh'} name={'Thresh'} />
        <ChampionListItem key={'Braum'} name={'Braum'} />
      </div>
    )
  }
}

interface ChampionListItemProps {
  name: string
}

export class ChampionListItem extends React.Component<ChampionListItemProps> {
  render() {
    return (
      <div className="container">
        <p className="championName">{this.props.name}</p>
      </div>
    )
  }
}
