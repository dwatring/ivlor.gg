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
  champion = {
    name: "",
    title: "",
    tags: [],
    image: { full: "" },
    blurb: ""
  };

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
    const { name, title, tags, image, blurb } = this.champion;
    const blurImageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${image.full.replace('.png', '_0.jpg')}`;

    return (
      <div>
        <div className="backgroundContainer">
          <div className="nameContainer">{name}
            <div className="titleContainer">{title}
              <img src={blurImageUrl} alt={`${name} blur`} />
              <div>
                <strong>Tags:</strong>
                <ul>
                  {tags.map((tag, index) => (
                    <li key={index}>{tag}</li>
                  ))}
                </ul>
              </div>
              <p>{blurb}</p>
              <Link to="/champions">CHANGE PAGE</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}