import App from "../../App";
import { AudioEditorElement } from "../../Components/Editor/AudioEditorElement";
import { RATIO_MILLS_BY_PX } from "../../Env";
import SampleRegion from "../../Models/Region/SampleRegion";

export default class AudioEditorController {
    private _app: App;
    private _currentEditor: AudioEditorElement | null = null;
    private _lastKnownPlayheadPos: number = 0;
    private isAudioEditorOpened = false;

    constructor(app: App) {
        this._app = app;
        
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
        audioEditorElement.setAudioBuffer(region.buffer, region.start / 1000);
        
        // Initialize playhead with last known app position
        audioEditorElement.updatePlayhead(this._lastKnownPlayheadPos);
        
        audioEditorElement.addEventListener('audioeditorplayheadmove', (e: Event) => {
            const customEvent = e as CustomEvent;
            const positionMs = customEvent.detail.positionMs;
            
            // Update our tracking and the app's playhead position
            this._lastKnownPlayheadPos = positionMs;
            this._app.host.playhead = positionMs;
            this._app.hostView.updateTimer(positionMs);
            
            // Convert to pixel position
            const pixelPos = positionMs / RATIO_MILLS_BY_PX;
            
            // Get the viewport width to calculate threshold
            const viewport = this._app.editorView.viewport;
            const viewportWidth = viewport.right - viewport.left;
            
            if (pixelPos > viewportWidth / 2) {
                this._app.editorView.viewport.moveCenter(pixelPos, viewport.center.y);
                this._app.editorView.horizontalScrollbar.moveTo(viewport.left); // Update scrollbar to match new viewport position
            } else {
                this._app.editorView.horizontalScrollbar.moveTo(pixelPos - (viewportWidth / 2));
            }
        });
        audioEditorElement.addEventListener('audioeditorclose', () => {
                this._app.audioEditorView.hide(audioEditorElement);
                this._currentEditor = null;
                this.isAudioEditorOpened = false;
            }
        );
        this.isAudioEditorOpened = true;
    }
    
    /**
     * Get the current playhead position in milliseconds
     * @returns Current playhead position
     */
    public getCurrentPlayheadPosition(): number {
        return this._lastKnownPlayheadPos;
    }

    public isAudioEditorOpen(): boolean {
        return this.isAudioEditorOpened;
    }
    
}