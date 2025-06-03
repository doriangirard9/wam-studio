import App from "../../App";
import { AudioEditorElement } from "../../Components/Editor/AudioEditorElement";
import SampleRegion from "../../Models/Region/SampleRegion";

export default class AudioEditorController {
    private _app: App;

    constructor(app: App) {
        this._app = app;
    }
    
    public showAudioEditor(region: SampleRegion): void {
        const audioEditorElement = new AudioEditorElement();
        this._app.audioEditorView.show(audioEditorElement);
        audioEditorElement.init();
        audioEditorElement.setAudioBuffer(region.buffer);
    }
}