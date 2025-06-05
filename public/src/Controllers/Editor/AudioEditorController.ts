import App from "../../App";
import { AudioEditorElement } from "../../Components/Editor/AudioEditorElement";
import SampleRegion from "../../Models/Region/SampleRegion";
import { RATIO_MILLS_BY_PX } from "../../Env";

export default class AudioEditorController {
    private _app: App;
    private _currentEditor: AudioEditorElement | null = null;
    private _lastKnownPlayheadPos: number = 0; // Store the last known playhead position

    constructor(app: App) {
        this._app = app;
        
        // Listen to app playhead movements
        this._app.host.onPlayHeadMove.add(this.handleAppPlayheadMove.bind(this));
    }
    
    /**
     * Handle application playhead movement events
     * @param pos Position in milliseconds
     * @param movedByPlayer Whether moved by playback or user
     */
    private handleAppPlayheadMove(pos: number, movedByPlayer: boolean): void {
        // Update our last known position
        this._lastKnownPlayheadPos = pos;
        
        // If an editor is open, update its playhead
        if (this._currentEditor) {
            this._currentEditor.updatePlayhead(pos, movedByPlayer);
        }
    }
    
    public showAudioEditor(region: SampleRegion): void {
        const audioEditorElement = new AudioEditorElement();
        this._app.audioEditorView.show(audioEditorElement);
        
        // Keep track of the current editor
        this._currentEditor = audioEditorElement;
        
        audioEditorElement.init();
        audioEditorElement.setAudioBuffer(region.buffer);
        
        // Initialize playhead with last known app position
        audioEditorElement.updatePlayhead(this._lastKnownPlayheadPos);
        
        audioEditorElement.addEventListener('audioeditorplayheadmove', (e: Event) => {
            const customEvent = e as CustomEvent;
            const positionMs = customEvent.detail.positionMs;
            
            this._lastKnownPlayheadPos = positionMs;
            this._app.host.playhead = positionMs;
            this._app.hostView.updateTimer(positionMs)
        });
    }
    
    /**
     * Get the current playhead position in milliseconds
     * @returns Current playhead position
     */
    public getCurrentPlayheadPosition(): number {
        return this._lastKnownPlayheadPos;
    }
    
}