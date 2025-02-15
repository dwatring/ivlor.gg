/* eslint-disable @typescript-eslint/ban-types */
import React from 'react'
import logo from '../assets/logo.svg'
import './Root.css'
import { makeObservable, observable, computed, action } from 'mobx'
import { observer } from 'mobx-react'
import { Link } from 'react-router-dom'

@observer
export default class App extends React.Component {
  constructor(props: {}) {
    super(props)
    makeObservable(this)
  }

  @observable
  title = 'Ivlor.gg'

  @computed
  get titleFormatted() {
    return this.title + '/nice'
  }

  @action
  changeTitle = () => {
    if (this.title === 'Ivlor.gg') {
      this.title = 'op.gg'
    } else {
      this.title = 'Ivlor.gg'
    }
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <Link to={`champions`}>GO TO CHAMPION LIST</Link>
        </header>
      </div>
    )
  }
}
