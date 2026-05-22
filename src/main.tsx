import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Humanizer from './humanizer'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Humanizer />
    </StrictMode>
)