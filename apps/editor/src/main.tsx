import { render } from 'preact';
import { App } from './app/App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
