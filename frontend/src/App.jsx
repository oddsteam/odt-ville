import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVillage, getHouse, saveLocation } from './api.js'
import { PLOTS, ENTRANCE } from './constants.js'
import VillageMap from './components/VillageMap.jsx'
import HouseInterior from './components/HouseInterior.jsx'

// Houses (sorted by position_order) drop onto the fixed building plots in
// order — admins never place buildings, which keeps the "no admin x/y" rule.
function buildBuildings(houses) {
  return [...houses]
    .sort((a, b) => a.position_order - b.position_order)
    .slice(0, PLOTS.length)
    .map((house, i) => ({ house, ...PLOTS[i] }))
}

export default function App() {
  const [currentScene, setCurrentScene] = useState('town') // "town" | "house"
  const [activeHouseId, setActiveHouseId] = useState(null)
  const [villageData, setVillageData] = useState(null)
  const [houseData, setHouseData] = useState(null)
  const [townSpawn, setTownSpawn] = useState(null) // { x, y, facing }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [houseLoading, setHouseLoading] = useState(false)

  const buildings = useMemo(
    () => (villageData ? buildBuildings(villageData.houses) : []),
    [villageData],
  )

  // Load the village. `applySpawn` recomputes where the avatar starts.
  const loadVillage = useCallback(async (applySpawn) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getVillage()
      setVillageData(data)
      if (applySpawn) {
        const b = buildBuildings(data.houses)
        const spawnHouse =
          data.spawn && data.spawn.house_id != null
            ? b.find((x) => x.house.id === data.spawn.house_id)
            : null
        // Returning visitor: stand on the mat outside their last house.
        // Otherwise: the Town Entrance. Always on the map — never in a board.
        setTownSpawn(
          spawnHouse
            ? { x: spawnHouse.doorCol, y: spawnHouse.doorRow + 1, facing: 'up' }
            : { x: ENTRANCE.x, y: ENTRANCE.y, facing: 'up' },
        )
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVillage(true)
  }, [loadVillage])

  const handleEnterHouse = useCallback(async (id) => {
    setHouseLoading(true)
    setError(null)
    try {
      const data = await getHouse(id)
      setHouseData(data)
      setActiveHouseId(id)
      setCurrentScene('house')
      saveLocation({ last_area: 'house', last_house_id: id, last_room: null }).catch(
        () => {},
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setHouseLoading(false)
    }
  }, [])

  const handleExitHouse = useCallback(() => {
    const id = activeHouseId
    const b = buildings.find((x) => x.house.id === id)
    // Step back out onto the doormat of the house just visited.
    if (b) setTownSpawn({ x: b.doorCol, y: b.doorRow + 1, facing: 'down' })
    setCurrentScene('town')
    setHouseData(null)
    setActiveHouseId(null)
    saveLocation({ last_area: 'town', last_house_id: id, last_room: null }).catch(
      () => {},
    )
    loadVillage(false)
  }, [activeHouseId, buildings, loadVillage])

  const handleCloseDailyBrief = useCallback(() => {
    loadVillage(false)
  }, [loadVillage])

  // ---- Render states -------------------------------------------------

  if (loading && !villageData) {
    return (
      <div className="app-shell app-centered">
        <div className="loading-card">
          <div className="loading-pixel" />
          <p>LOADING ONE REV VILLAGE…</p>
        </div>
      </div>
    )
  }

  if (error && !villageData) {
    return (
      <div className="app-shell app-centered">
        <div className="error-card">
          <h2>CAN'T REACH THE VILLAGE</h2>
          <p className="error-detail">{error}</p>
          <button type="button" onClick={() => loadVillage(true)}>
            RETRY
          </button>
        </div>
      </div>
    )
  }

  if (!villageData || !townSpawn) return null

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">🕹️</span>
          <div>
            <h1>ONE REV VILLAGE</h1>
            <p className="app-company">{villageData.company.name}</p>
          </div>
        </div>
        <div className="app-user">
          <span className="app-user-name">{villageData.user.name}</span>
          <span className="app-user-role">{villageData.user.role}</span>
        </div>
      </header>

      {error && villageData && (
        <div className="error-banner">
          {error}
          <button type="button" onClick={() => setError(null)}>
            DISMISS
          </button>
        </div>
      )}

      <main className="app-main">
        {currentScene === 'town' && (
          <VillageMap
            buildings={buildings}
            houses={villageData.houses}
            townSpawn={townSpawn}
            dailyBrief={villageData.daily_brief}
            onEnterHouse={handleEnterHouse}
            onRefetch={handleCloseDailyBrief}
          />
        )}

        {currentScene === 'house' && houseData && (
          <HouseInterior houseData={houseData} onExit={handleExitHouse} />
        )}

        {houseLoading && (
          <div className="scene-loading-overlay">
            <div className="loading-pixel" />
            <p>ENTERING…</p>
          </div>
        )}
      </main>
    </div>
  )
}
