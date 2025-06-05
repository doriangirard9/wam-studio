import { AudioEditorElement } from "../../Components/Editor/AudioEditorElement";

export default class AudioEditorView {
    audioEditorContainerDiv: HTMLDivElement = document.getElementById("audio-editor") as HTMLDivElement;

    public show(audioEditor: AudioEditorElement): void {
        if (this.audioEditorContainerDiv.contains(audioEditor)) return;
        this.audioEditorContainerDiv.appendChild(audioEditor);
    }

    public hide(audioEditor: AudioEditorElement): void {
        audioEditor.remove();
    }
}