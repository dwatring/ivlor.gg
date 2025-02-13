import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import { Link } from 'react-router-dom';
import './SingleChampionPage.css';
import { useState } from "react";

// Define the Skin interface
interface Skin {
  id: string;
  num: number;
  name: string;
  chromas: boolean;
}

@observer
export default class SingleChampionPage extends React.Component {
  constructor(props: {}) {
    super(props);
    makeObservable(this);
  }

  @observable
  championID = window.location.href.split('champions/')[1];

  @observable
  champion = {
    name: "",
    title: "",
    tags: [] as string[], // Explicitly type the tags array
    image: { full: "" },
    blurb: "",
    skins: [] as Skin[], // Explicitly type the skins array
  };

  async getChampionsFromAPI() {
    try {
      let response = await fetch(`https://ddragon.leagueoflegends.com/cdn/14.15.1/data/en_US/champion/${this.championID}.json`);
      let responseJson = await response.json();

      // Extract champion data
      const championData = responseJson.data[this.championID];

      // Update the champion observable
      this.champion = {
        name: championData.name,
        title: championData.title,
        tags: championData.tags,
        image: championData.image,
        blurb: championData.blurb,
        skins: championData.skins as Skin[], // Explicitly type the skins array
      };

      console.log("Champion Data:", championData);
    } catch (error) {
      console.error("Error fetching champion data:", error);
    }
  }

  componentDidMount() {
    this.getChampionsFromAPI();
  }


  render() {
    const { name, title, tags, image, blurb, skins } = this.champion;
    const blurImageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${image.full.replace('.png', '_0.jpg')}`;

    return (
      <div className="championWrapper">
        {/* Champion Card */}
        <div className="backgroundContainer">
          <div className="foregroundContainer">
            <div className="nameContainer">{name}</div>
            <div className="titleContainer">{title}</div>
            <img className="imgContainer" src={blurImageUrl} alt={`${name} blur`} />

            <div className="tagsContainer">
              <strong>Tags:</strong>
              <ul className="tagsList">
                {tags.map((tag, index) => (
                  <li className="tagItem" key={index}>{tag}</li>
                ))}
              </ul>
            </div>

            <p className="blurbText">{blurb}</p>
          </div>

          <Link className="changePageLink" to="/champions">CHANGE PAGE</Link>
        </div>

        {/* Skins Section - Now Separate and Next to Champion Card */}
        <div className="skinContainer">
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
      </div>
    );
  }
}