import React from 'react'
import './App.css'
import ChatWindow from './Components/ChatWindow/ChatWindow'
import QuickAdd from './Components/QuickAdd/QuickAdd'

function App() {

  return (
    <React.Fragment>
      <QuickAdd/>
      <ChatWindow/>
    </React.Fragment>
  )
}

export default App
