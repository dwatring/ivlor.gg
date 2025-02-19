import React from 'react'
import { Link } from 'react-router-dom'
import SummonerSearch from '../components/SummonerSearch'

export default class SummonerPage extends React.Component {
    render() {
        return (
            <div>
                <SummonerSearch />
                <Link to={`/`}>GO TO HOME</Link>
            </div>

        )
    }
}
