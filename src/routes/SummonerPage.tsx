import React from 'react'
import SummonerSearch from '../components/SummonerSearch'
import { Link } from 'react-router-dom'

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
