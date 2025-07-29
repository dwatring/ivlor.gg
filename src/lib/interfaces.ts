export interface Participant {
  riotIdGameName: string
  puuid: string
  doublekill: number
  triplekill: number
  quadrakill: number
  pentakill: number
  kills: number
  assists: number
  deaths: number
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  championName: string
  champLevel: number
  totalMinionsKilled: number
  win: boolean
  summonerLevel: number
  totalDamageDealtToChampions: number
  totalDamageTaken: number
  visionScore: number
  neutralMinionsKilled: number
  wardsKilled: number
  wardsPlaced: number
  detectorWardsPlaced: number //Pink Wards
  goldEarned: number
  summoner1Id: number
  summoner2Id: number
  perks: {
    statPerks: {
      defense: number
      flex: number
      offense: number
    }
    styles: {
      description: string
      style: number
      selections: {
        perk: number
        var1: number
        var2: number
        var3: number
      }[]
    }[]
  }
}
