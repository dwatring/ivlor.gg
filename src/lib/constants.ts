export const summonerSpellIdMap: { [id: number]: string } = {
  1: 'SummonerBoost', // Ghost
  3: 'SummonerExhaust', // Exhaust
  4: 'SummonerFlash', // Flash
  6: 'SummonerHaste', // Haste
  7: 'SummonerHeal', // Heal
  11: 'SummonerSmite', // Smite
  12: 'SummonerTeleport', // Teleport
  13: 'SummonerMana', // Clarity
  14: 'SummonerDot', // Ignite
  21: 'SummonerBarrier', // Barrier
  32: 'SummonerSnowball', // Snowball
  39: 'SummonerChillingSmite', // Chilling Smite
  55: 'SummonerPoroRecall', // Poro Recall
  56: 'SummonerMark', // Mark (used by Kindred)
  57: 'SummonerPoroThrow', // Poro Throw
  59: 'SummonerPoroCoin', // Poro Coin
  61: 'SummonerShurimaRecall', // Shurima Recall
}

export const getItemImageUrl = (itemId: number) => {
  // Use the item ID to generate the URL for the item's image
  return `https://ddragon.leagueoflegends.com/cdn/15.6.1/img/item/${itemId}.png`
}