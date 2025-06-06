const template = document.createElement("template");

// Modify the CSS styles to ensure the component takes more height

template.innerHTML = /*html*/`
<style id="style">
/* Main container */
.main-waveform-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 400px; /* Increase minimum height to 400px */
  background-color: rgba(0, 0, 0, 0.5);
  padding: 5px;
  box-sizing: border-box;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

/* Container for timeline and waveform */
.timeline-waveform-container {
  position: relative;
  width: 100%;
  height: calc(100% - 80px); /* Allocate more space for the waveform, leave 80px for controls */
  min-height: 320px; /* Ensure minimum height for the waveform container */
}

/* Timeline canvas styling */
#timelineCanvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  border-radius: 5px;
  z-index: 1;
}

/* Main waveform canvas styling */
#waveform {
  position: absolute;
  top: 30px; /* Leave space for timeline labels at top */
  left: 0;
  width: 100%;
  height: calc(100% - 30px);
  background: transparent; /* Transparent background to see the timeline */
  z-index: 2;
}

/* Scrollbar container */
#scrollbarContainer {
  width: 100%;
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

#scrollBar {
  width: 100%;
  height: 15px; /* Make scrollbar a bit taller */
  cursor: pointer;
  background: #555;
  border-radius: 5px;
}

/* Style for the zoom control */
.zoom-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 40px; /* Set explicit height for the zoom control */
}

#zoomSlider {
  width: 300px;
  height: 20px;
}

#zoomInput {
  width: 60px;
  background: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
}

#zoomInput:focus {
  outline: none;
  border-color: #4CAF50;
}

#zoomValue {
  width: 40px;
  text-align: center;
}

/* Playhead styling */
.playhead {
  position: absolute;
  top: 0;
  height: 100%;
  width: 1px;
  background-color: rgba(200, 200, 200, 0.7);
  pointer-events: auto;
  z-index: 3;
  transition: left 0.05s linear;
}

.playhead::before {
  content: "";
  position: absolute;
  top: 0;
  left: -4px;
  width: 9px;
  height: 9px;
  background-color: white;
  clip-path: polygon(50% 100%, 0% 0%, 100% 0%);
}

.close-button-container {
  position: relative;
  width: 100%;
}

.close-button {
  position: absolute;
  width: 30px;
  height: 30px;
  top: 5px;
  right: 5px;
  background-color: rgba(255, 0, 0, 0.7);
  border-radius: 10%;
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
  z-index: 4;
}

.time-selection {
  position: absolute;
  background-color: rgba(100, 149, 237, 0.3);
  border: 1px solid rgba(100, 149, 237, 0.7);
  pointer-events: none;
  z-index: 3;
}

</style>

<div class="main-waveform-container">
  <div class="close-button-container">
    <button class="close-button">X</button>
  </div>

  <!-- Combined waveform view with timeline -->
  <div class="timeline-waveform-container">
    <!-- Timeline canvas as background -->
    <canvas id="timelineCanvas"></canvas>
    
    <!-- Waveform canvas overlaid -->
    <canvas id="waveform"></canvas>

    <!-- Playhead element -->
    <div class="playhead" id="audioEditorPlayhead"></div>
 
  </div>

  <!-- Horizontal scroll bar to pan -->
  <div id="scrollbarContainer">
    <input type="range" id="scrollBar" min="0" value="0" step="0.01" />
  </div>

  <div class="zoom-control">
    <label for="zoomSlider">Zoom:</label>
    <input type="range" id="zoomSlider" min="0.5" max="100" step="0.1" value="1">
    <span id="zoomValue">1x</span>
    <input type="number" id="zoomInput" min="0.5" max="100" step="0.1" value="1">
  </div>

  <button class="normalize-button">Normalize</button>
</div>
`;

// Define constants for virtual canvas
const DEFAULT_VIRTUAL_DURATION = 600; // 10 minutes by default
const MIN_CANVAS_DURATION = 60; // Minimum 1 minute duration for visualization
const DEFAULT_PRECISION = 100;

// Define zoom milestones for waveform recalculation
const ZOOM_MILESTONES = [0.1, 0.2, 0.5, 1, 2, 4, 6, 8, 10, 14, 18, 22, 28, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 100];

export class AudioEditorElement extends HTMLElement {
  public shadow: ShadowRoot;

  private audioBuffer: AudioBuffer | null = null;
  private audioStartTime: number = 0;

  private startTimeSelection: number = -1;
  private endTimeSelection: number = -1;
  private isSelecting: boolean = false;
  private selectionStartX: number = 0;
  private selectionEndX: number = 0;
  private selectionElement: HTMLElement | null = null;
  
  // Reference to timeline canvas
  private timelineCanvas!: HTMLCanvasElement;
  private waveformCanvas!: HTMLCanvasElement;

  // Track visible portion in main waveform
  private visibleStart: number = 0;
  private visibleEnd: number = MIN_CANVAS_DURATION;
  
  // Current zoom level
  private currentZoom: number = 1;
  // Store the last calculated zoom level
  private lastCalculatedZoom: number = 1;
  // Store the waveform drawer instance for reuse with visual zoom
  private currentWaveformDrawer: WaveformDrawer | null = null;
  
  // Canvas virtual duration (not audio-dependent)
  private canvasDuration: number = DEFAULT_VIRTUAL_DURATION;
  
  // Observer for resizing
  private resizeObserver: ResizeObserver;

  // Playhead
  private playheadElement!: HTMLElement;
  private playheadPosition: number = 0;

  // Do we use page-based scrolling triggered by playhead, or dynamic scrolling
  private readonly usePageBasedScrolling: boolean = true;
  
  private isDraggingPlayhead: boolean = false;


  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    
    // Create resize observer to handle canvas resizing
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
  }

  public async connectedCallback() {
    this.shadow.appendChild(template.content.cloneNode(true));
    
    // Wait for the next frame to ensure DOM is fully updated
    requestAnimationFrame(() => {
      // Observe the container for resize events
      const container = this.shadow.querySelector('.timeline-waveform-container');
      if (container) {
        this.resizeObserver.observe(container);
      } else {
        console.error('Could not find timeline-waveform-container element');
      }
      
      // Set initial canvas size after a short delay to ensure dimensions are correct
      setTimeout(() => {
        this.handleResize();
        
        // Draw test waveform if no audio is loaded
        if (!this.audioBuffer) {
          console.log('No audio loaded, drawing test pattern');
          // Create a debug audio buffer to test rendering
          const testDuration = 2;
          const sampleRate = 44100;
          const testBuffer = new AudioContext().createBuffer(
            2, 
            testDuration * sampleRate, 
            sampleRate
          );
          
          // Fill with a simple sine wave
          for (let channel = 0; channel < 2; channel++) {
            const data = testBuffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) {
              data[i] = Math.sin(i / 100) * 0.5;
            }
          }
          
          this.setAudioBuffer(testBuffer, 0);
        }
      }, 100);
    });
  }
  
  public disconnectedCallback() {
    // Clean up resize observer
    this.resizeObserver.disconnect();
  }

  /**
   * Handle resizing of the container
   */
  private handleResize() {
    // Get the container dimensions
    const container = this.shadow.querySelector('.timeline-waveform-container');
    if (!container) return;
    
    // Update canvas dimensions to match container
    const rect = container.getBoundingClientRect();
    
    if (this.timelineCanvas) {
      this.timelineCanvas.width = rect.width;
      this.timelineCanvas.height = rect.height;
    }
    
    if (this.waveformCanvas) {
      this.waveformCanvas.width = rect.width;
      this.waveformCanvas.height = rect.height - 30; // Account for timeline header
    }
    
    // Refresh the view with new dimensions
    this.refreshView(this.visibleStart, this.visibleEnd);
  }

  /**
   * Find the nearest zoom milestone to use for calculation
   */
  private getNearestLowerMilestone(zoom: number): number {
    // Find the largest milestone that's less than or equal to the zoom
    for (let i = ZOOM_MILESTONES.length - 1; i >= 0; i--) {
      if (ZOOM_MILESTONES[i] <= zoom) {
        return ZOOM_MILESTONES[i];
      }
    }
    
    // Default to the lowest milestone if zoom is less than all milestones
    return ZOOM_MILESTONES[0];
  }

  public init() {
    this.waveformCanvas = this.shadow.getElementById("waveform") as HTMLCanvasElement;
    this.timelineCanvas = this.shadow.getElementById("timelineCanvas") as HTMLCanvasElement;
    this.initPlayhead();
    this.initSelection();

    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;

    const closeButton = this.shadow.querySelector('.close-button') as HTMLButtonElement;
    closeButton.addEventListener('click', () => {
      this.onCloseButtonClick();
    });
    const normalizeButton = this.shadow.querySelector('.normalize-button') as HTMLButtonElement;
    normalizeButton.addEventListener('click', () => {
      this.onNormalizeButtonClick();
    });
    
    // Get reference to the scroll bar
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    this.setupWheelZoom();

    // We'll hold onto a WaveformDrawer instance for reuse with visual zoom
    this.currentWaveformDrawer = null;

    // Set initial canvas size
    this.handleResize();
    
    // Initialize empty canvas
    this.initializeEmptyCanvas();
    
    const updateUI = (start: number, end: number) => {
      this.refreshView(start, end);
    };
    
    const updateZoom = (zoom: number) => {
      // Clamp zoom to valid range
      zoom = Math.max(0.5, Math.min(100, zoom));
      
      // Store the current zoom level
      this.currentZoom = zoom;
      
      // Calculate visible duration based on current zoom
      const visibleDuration = this.canvasDuration / zoom;
      
      // For slider zoom, always try to center on playhead position with no fallback
      let zoomCenterSecs = this.playheadPosition;
      
      // If playhead is outside visible range, adjust it to the current visible center
      if (!this.isPlayheadInVisibleRange(this.playheadPosition * 1000)) {
        zoomCenterSecs = (this.visibleStart + this.visibleEnd) / 2;
      }
      
      // Calculate new start and end times based on center point
      const start = Math.max(0, zoomCenterSecs - visibleDuration / 2);
      const end = Math.min(this.canvasDuration, start + visibleDuration);
      
      // Update UI with new range
      updateUI(start, end);
    };

    
    // Initialize the scrollbar properly
    scrollBar.min = "0";
    scrollBar.max = (this.canvasDuration - MIN_CANVAS_DURATION).toFixed(2);
    scrollBar.value = "0";

    let lastZoomDrawn = -1;

    zoomSlider.addEventListener("input", () => {
      const zoom = parseFloat(zoomSlider.value);
      
      // Update zoom input and label immediately for smooth UI feedback
      zoomInput.value = zoom.toFixed(1);
      zoomValue.textContent = `${zoom.toFixed(1)}x`;

      // Check if zoom is a multiple of 0.1 and not already drawn
      const isAtMultipleOfPointOne = Math.abs(zoom * 10 - Math.round(zoom * 10)) < 0.05;

      if (isAtMultipleOfPointOne && Math.abs(zoom - lastZoomDrawn) >= 0.1) {
        lastZoomDrawn = zoom;
        updateZoom(zoom);
      }
    });
    
    // Trigger a visual update without recalculating peaks when the zoom slider is released
    zoomSlider.addEventListener("change", () => {
      const zoom = parseFloat(zoomSlider.value);
      updateZoom(zoom);
    });
    
    // Handle manual zoom input
    zoomInput.addEventListener("change", () => {
      const zoom = parseFloat(zoomInput.value);
      if (!isNaN(zoom) && zoom >= 0.5 && zoom <= 100) {
        updateZoom(zoom);
      } else {
        // Reset to valid value if input is invalid
        zoomInput.value = this.currentZoom.toFixed(1);
      }
    });
    
    // Handle pressing Enter in the zoom input
    zoomInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const zoom = parseFloat(zoomInput.value);
        if (!isNaN(zoom) && zoom >= 0.5 && zoom <= 100) {
          updateZoom(zoom);
        } else {
          // Reset to valid value if input is invalid
          zoomInput.value = this.currentZoom.toFixed(1);
        }
      }
    });
    
    // Add event listener for the scroll bar
    scrollBar.addEventListener("input", () => {
      const scrollPosition = parseFloat(scrollBar.value);
      
      // Calculate visible duration based on current visible area
      const visibleDuration = this.visibleEnd - this.visibleStart;
      
      // Calculate new start and end based on scroll position
      const newStart = scrollPosition;
      const newEnd = Math.min(this.canvasDuration, newStart + visibleDuration);
      
      // Update UI with new range
      updateUI(newStart, newEnd);
    });
  }

  /**
   * Initialize selection functionality
   */
  private initSelection(): void {
    // Create selection element
    this.selectionElement = document.createElement('div');
    this.selectionElement.className = 'time-selection';
    this.selectionElement.style.position = 'absolute';
    this.selectionElement.style.backgroundColor = 'rgba(100, 149, 237, 0.3)';
    this.selectionElement.style.border = '1px solid rgba(100, 149, 237, 0.7)';
    this.selectionElement.style.pointerEvents = 'none';
    this.selectionElement.style.display = 'none';
    this.selectionElement.style.zIndex = '3';
    this.selectionElement.style.top = '30px'; // Position below timeline labels
    this.selectionElement.style.height = 'calc(100% - 30px)';
    
    const container = this.shadow.querySelector('.timeline-waveform-container');
    if (container) {
      container.appendChild(this.selectionElement);
    }
    
    // Add mouse event listeners for selection
    this.waveformCanvas.addEventListener('mousedown', (e) => {
      // Only start selection if not dragging playhead and not shift-clicking (avoid conflicts)
      if (!this.isDraggingPlayhead && !e.shiftKey) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.selectionStartX = e.clientX - rect.left;
        this.selectionEndX = this.selectionStartX;
        
        // Calculate start time based on position
        const positionRatio = this.selectionStartX / this.waveformCanvas.width;
        this.startTimeSelection = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
        this.endTimeSelection = this.startTimeSelection;
        
        this.isSelecting = true;
        this.updateSelectionDisplay();
        
        // Prevent default to avoid conflicts with other interactions
        e.preventDefault();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isSelecting) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.selectionEndX = Math.max(0, Math.min(e.clientX - rect.left, this.waveformCanvas.width));
        
        // Calculate end time based on position
        const positionRatio = this.selectionEndX / this.waveformCanvas.width;
        this.endTimeSelection = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
        
        this.updateSelectionDisplay();
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (this.isSelecting) {
        this.isSelecting = false;
        
        // Ensure start time is before end time
        if (this.startTimeSelection > this.endTimeSelection) {
          [this.startTimeSelection, this.endTimeSelection] = [this.endTimeSelection, this.startTimeSelection];
        }

        this.startTimeSelection = Math.max(0, this.startTimeSelection - this.audioStartTime);
        this.endTimeSelection = Math.max(0, this.endTimeSelection - this.audioStartTime);
        
        // If selection is too small, clear it
        if (Math.abs(this.endTimeSelection - this.startTimeSelection) < 0.01) {
          this.clearSelection();
        } else {
          // Dispatch event about selection change
          const selectionEvent = new CustomEvent('audioeditorselection', {
            bubbles: true,
            composed: true,
            detail: {
              startTime: this.startTimeSelection,
              endTime: this.endTimeSelection
            }
          });
          this.dispatchEvent(selectionEvent);
        }
      }
    });
    
    // Double-click to clear selection
    this.waveformCanvas.addEventListener('dblclick', () => {
      this.clearSelection();
    });
  }

  /**
   * Clear the current selection
   */
  public clearSelection(): void {
    this.startTimeSelection = -1;
    this.endTimeSelection = -1;
    if (this.selectionElement) {
      this.selectionElement.style.display = 'none';
    }
    
    // Dispatch event that selection was cleared
    const clearEvent = new CustomEvent('audioeditorselectionclear', {
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(clearEvent);
  }

  /**
   * Restore selection display after view changes (like scrolling or zooming)
   */
  private restoreSelectionAfterViewChange(): void {
    if (this.startTimeSelection !== this.endTimeSelection) {
      // Convert time selection to pixel coordinates in current view
      const startRatio = (this.startTimeSelection - this.visibleStart) / (this.visibleEnd - this.visibleStart);
      const endRatio = (this.endTimeSelection - this.visibleStart) / (this.visibleEnd - this.visibleStart);
      
      this.selectionStartX = startRatio * this.waveformCanvas.width;
      this.selectionEndX = endRatio * this.waveformCanvas.width;
      
      this.updateSelectionDisplay();
    }
  }

  /**
   * Update the visual display of the selection area
   */
  private updateSelectionDisplay(): void {
    if (!this.selectionElement) return;
    
    // Calculate left position and width based on current selection points
    const left = Math.min(this.selectionStartX, this.selectionEndX);
    const width = Math.abs(this.selectionEndX - this.selectionStartX);
    
    // Update selection element style
    this.selectionElement.style.left = `${left}px`;
    this.selectionElement.style.width = `${width}px`;
    this.selectionElement.style.display = width > 0 ? 'block' : 'none';
  }

  private onCloseButtonClick() {
    const closeEvent = new CustomEvent('audioeditorclose', {
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(closeEvent);
  }

  private onNormalizeButtonClick() {
    if (!this.audioBuffer || this.startTimeSelection < 0 || this.endTimeSelection < 0) {
      console.warn('Normalization requires an active selection and a loaded audio buffer.');
      return;
    }

    const normalizedBuffer = this.normalizeAudioBufferSegment(this.audioBuffer, this.startTimeSelection, this.endTimeSelection);
    
    this.setAudioBuffer(normalizedBuffer, this.audioStartTime);
    
    const normalizeEvent = new CustomEvent('audiobufferchange', {
      bubbles: true,
      composed: true,
      detail: { normalizedBuffer }
    });
    this.dispatchEvent(normalizeEvent);
  }

  private normalizeAudioBufferSegment(
    audioBuffer: AudioBuffer,
    startTime: number,
    endTime: number
  ): AudioBuffer {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
  
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const endSample = Math.min(length, Math.floor(endTime * sampleRate));
  
    let maxAmplitude = 0;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = startSample; i < endSample; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxAmplitude) {
          maxAmplitude = abs;
        }
      }
    }
  
    if (maxAmplitude === 0) {
      return audioBuffer;
    }
  
    const normalizationFactor = 1 / maxAmplitude;
  
    const context = new AudioContext();
    const newBuffer = context.createBuffer(numberOfChannels, length, sampleRate);
  
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const input = audioBuffer.getChannelData(channel);
      const output = newBuffer.getChannelData(channel);
  
      for (let i = 0; i < length; i++) {
        if (i >= startSample && i < endSample) {
          output[i] = input[i] * normalizationFactor;
        } else {
          output[i] = input[i];
        }
      }
    }
  
    return newBuffer;
  }

  /**
   * Set up mouse wheel zoom functionality
   */
  private setupWheelZoom(): void {
    const container = this.shadow.querySelector('.timeline-waveform-container') as HTMLElement;
    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    
    if (!container || !zoomSlider) return;
    
    // Add wheel event listener to container
    container.addEventListener('wheel', (e) => {
      // Prevent default behavior (page scrolling)
      e.preventDefault();
      
      // Determine zoom direction based on wheel delta
      const zoomDirection = e.deltaY < 0 ? 1 : -1; // 1 for zoom in, -1 for zoom out
      
      // Calculate zoom increment based on current zoom level (smaller steps at lower zoom)
      const zoomIncrement = this.currentZoom < 5 ? 0.5 : (this.currentZoom < 20 ? 1 : 2);
      
      // Calculate new zoom level
      let newZoom = this.currentZoom + (zoomDirection * zoomIncrement);
      
      // Clamp zoom to valid range
      newZoom = Math.max(0.5, Math.min(100, newZoom));
      
      // Get cursor position relative to container
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorPosRatio = cursorX / this.waveformCanvas.width;
      const cursorPosSecs = this.visibleStart + cursorPosRatio * (this.visibleEnd - this.visibleStart);
      
      // Determine zoom center point
      let zoomCenterSecs;
      const edgeBuffer = (this.visibleEnd - this.visibleStart) * 0.1; // 10% buffer from edge
      
      // Check if playhead is visible and not too close to the edge
      if (this.isPlayheadInVisibleRange(this.playheadPosition * 1000) && 
          this.playheadPosition >= (this.visibleStart + edgeBuffer) &&
          this.playheadPosition <= (this.visibleEnd - edgeBuffer)) {
        // Use playhead position as zoom center
        zoomCenterSecs = this.playheadPosition;
      } else {
        // Use cursor position as fallback
        zoomCenterSecs = cursorPosSecs;
      }
      
      // Calculate the new visible range based on center point and new zoom
      const visibleDuration = this.canvasDuration / newZoom;
      const newStart = Math.max(0, zoomCenterSecs - (visibleDuration / 2));
      const newEnd = Math.min(this.canvasDuration, newStart + visibleDuration);
      
      // Update UI elements
      zoomSlider.value = newZoom.toString();
      
      // Update zoom display and internal state
      this.currentZoom = newZoom;
      
      // Refresh the view with new range
      this.refreshView(newStart, newEnd);
    }, { passive: false });
  }

  /**
   * Initialize the playhead element and set up interactivity
   */
  private initPlayhead(): void {
    this.playheadElement = this.shadow.getElementById("audioEditorPlayhead") as HTMLElement;
    if (!this.playheadElement) return;
    
    // Add cursor style to indicate interactivity
    this.playheadElement.style.cursor = 'col-resize';
    
    const container = this.shadow.querySelector('.timeline-waveform-container') as HTMLElement;
    if (!container) return;
    
    // Allow clicking directly on playhead to start dragging
    this.playheadElement.addEventListener('mousedown', (e) => {
      this.isDraggingPlayhead = true;
      e.preventDefault();
      
      // Visual feedback during drag
      this.playheadElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      document.body.style.cursor = 'col-resize';
      
      // Disable transition for smoother dragging
      this.playheadElement.style.transition = 'none';
    });
    
    // Allow clicking anywhere in the container to move playhead
    container.addEventListener('mousedown', (e) => {
      // Only handle direct container clicks (not on other controls)
      if (e.target === container || 
          e.target === this.waveformCanvas || 
          e.target === this.timelineCanvas) {
        // Calculate click position relative to container
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Move playhead to clicked position
        this.movePlayheadToPosition(x);
        
        // Start dragging
        this.isDraggingPlayhead = true;
        
        // Visual feedback
        this.playheadElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        document.body.style.cursor = 'col-resize';
        this.playheadElement.style.transition = 'none';
      }
    });
    
    // Track mouse movement while dragging
    document.addEventListener('mousemove', (e) => {
      if (!this.isDraggingPlayhead) return;
      
      const rect = container.getBoundingClientRect();
      let x = e.clientX - rect.left;
      
      // Constrain to container bounds
      x = Math.max(0, Math.min(x, container.offsetWidth));
      
      // Update playhead position
      this.movePlayheadToPosition(x);
    });
    
    // End dragging when mouse is released
    document.addEventListener('mouseup', () => {
      if (!this.isDraggingPlayhead) return;
      
      // Reset state
      this.isDraggingPlayhead = false;
      
      // Restore appearance
      this.playheadElement.style.backgroundColor = 'rgba(200, 200, 200, 0.7)';
      document.body.style.cursor = 'default';
      this.playheadElement.style.transition = 'left 0.05s linear';
    });
  }

  /**
   * Move the playhead to a specific pixel position in the editor
   * @param pixelPosition X position in pixels within the waveform container
   */
  private movePlayheadToPosition(pixelPosition: number): void {
    if (!this.waveformCanvas) return;
    
    // Calculate the corresponding time in seconds
    const positionRatio = pixelPosition / this.waveformCanvas.width;
    const timeInSeconds = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
    
    // Update internal state
    this.playheadPosition = timeInSeconds;
    
    // Update visual position
    this.playheadElement.style.left = `${pixelPosition}px`;
    this.playheadElement.style.display = 'block';

    // Check for edge scrolling when dragging near canvas edges
    if (this.isDraggingPlayhead) {
      const edgeThreshold = this.waveformCanvas.width * 0.15; // 15% from edge
      const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
      
      if (scrollBar) {
        const visibleDuration = this.visibleEnd - this.visibleStart;
        let newStart = this.visibleStart;
        let needsRefresh = false;
        
        // If near right edge, scroll right
        if (pixelPosition > this.waveformCanvas.width - edgeThreshold) {
          // Calculate how far into the edge zone we are (as a percentage)
          const edgeDepth = (pixelPosition - (this.waveformCanvas.width - edgeThreshold)) / edgeThreshold;
          // Scroll by a percentage of visible duration based on edge depth
          const scrollAmount = Math.min(visibleDuration * 0.1 * edgeDepth, 
                                      this.canvasDuration - visibleDuration - this.visibleStart);
          
          if (scrollAmount > 0) {
            newStart = this.visibleStart + scrollAmount;
            needsRefresh = true;
          }
        }
        // If near left edge, scroll left
        else if (pixelPosition < edgeThreshold) {
          // Calculate how far into the edge zone we are (as a percentage)
          const edgeDepth = (edgeThreshold - pixelPosition) / edgeThreshold;
          // Scroll by a percentage of visible duration based on edge depth
          const scrollAmount = Math.min(visibleDuration * 0.1 * edgeDepth, this.visibleStart);
          
          if (scrollAmount > 0) {
            newStart = this.visibleStart - scrollAmount;
            needsRefresh = true;
          }
        }
        
        // Apply the scroll if needed
        if (needsRefresh) {
          scrollBar.value = newStart.toString();
          this.refreshView(newStart, newStart + visibleDuration);
          
          // Recalculate pixel position after scroll to keep playhead at cursor
          const newPositionRatio = (this.playheadPosition - newStart) / visibleDuration;
          const newPixelPosition = newPositionRatio * this.waveformCanvas.width;
          this.playheadElement.style.left = `${newPixelPosition}px`;
        }
      }
    }

    // Dispatch custom event to notify application about playhead movement
    const event = new CustomEvent('audioeditorplayheadmove', {
      bubbles: true, 
      composed: true,
      detail: {
        positionMs: timeInSeconds * 1000,
        source: 'audioeditor'
      }
    });
    
    this.dispatchEvent(event);
  }
  
  /**
   * Initialize an empty canvas with time markers
   */
  private initializeEmptyCanvas(): void {
    const ctx = this.waveformCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    
    // Draw a horizontal line in the center
    ctx.beginPath();
    ctx.moveTo(0, this.waveformCanvas.height / 2);
    ctx.lineTo(this.waveformCanvas.width, this.waveformCanvas.height / 2);
    ctx.strokeStyle = "#333";
    ctx.stroke();
  }

  /**
   * Draws a timeline behind the waveform showing time markers with vertical grid lines
   * @param start Start time in seconds
   * @param end End time in seconds
   */
  private drawTimeline(start: number, end: number): void {
    if (!this.timelineCanvas) return;
    
    const ctx = this.timelineCanvas.getContext("2d");
    if (!ctx) return;
    
    const width = this.timelineCanvas.width;
    const height = this.timelineCanvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set text properties
    ctx.font = "10px Arial";
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "center";
    
    const duration = end - start;
    
    // Determine appropriate time interval based on zoom level
    let interval: number;
    let minorTickCount: number = 5; // Default number of minor ticks between major ticks
    
    if (duration <= 0.5) {
      interval = 0.1; // 100ms intervals
      minorTickCount = 10; // 10ms minor ticks
    } else if (duration <= 1) {
      interval = 0.2; // 200ms intervals
      minorTickCount = 4; // 50ms minor ticks
    } else if (duration <= 3) {
      interval = 0.5; // 500ms intervals
      minorTickCount = 5; // 100ms minor ticks
    } else if (duration <= 10) {
      interval = 1; // 1 second intervals
      minorTickCount = 5; // 200ms minor ticks
    } else if (duration <= 30) {
      interval = 5; // 5 second intervals
      minorTickCount = 5; // 1 second minor ticks
    } else if (duration <= 60) {
      interval = 10; // 10 second intervals
      minorTickCount = 10; // 1 second minor ticks
    } else if (duration <= 300) {
      interval = 30; // 30 second intervals
      minorTickCount = 6; // 5 second minor ticks
    } else {
      interval = 60; // 1 minute intervals
      minorTickCount = 6; // 10 second minor ticks
    }
    
    // Calculate minor interval based on the major interval and desired tick count
    const minorInterval = interval / minorTickCount;
    
    // Find the first tick position (round start to nearest minor interval for completeness)
    const firstMinorTick = Math.ceil(start / minorInterval) * minorInterval;
    
    // Draw all ticks (both minor and major)
    for (let time = firstMinorTick; time < end; time += minorInterval) {
      // Calculate the x position for this timestamp
      const x = ((time - start) / duration) * width;
      
      // Check if this is a major tick (divisible by the interval)
      const isMajorTick = Math.abs(time % interval) < 0.0001;
      
      // Determine if this time position has audio content (if audio is loaded)
      const hasAudioContent = this.audioBuffer && time < this.audioBuffer.duration && time >= 0;
      
      if (isMajorTick) {
        // Draw full-height vertical grid line for major tick
        ctx.beginPath();
        ctx.moveTo(x, 20); // Start below the labels
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(136, 136, 136, 0.3)"; // Semi-transparent grid lines
        ctx.stroke();
        
        // Draw major tick mark at the top
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 16);
        ctx.strokeStyle = "#888";
        ctx.stroke();
        
        // Format time for display
        let formattedTime: string;
        if (time < 60) {
          // For times less than 1 minute, show seconds
          formattedTime = time.toFixed(1) + "s";
        } else {
          // For times >= 1 minute, show minutes:seconds
          const minutes = Math.floor(time / 60);
          const seconds = time % 60;
          formattedTime = `${minutes}:${seconds.toFixed(0).padStart(2, '0')}`;
        }
        
        // Draw timestamp
        ctx.fillText(formattedTime, x, 14);
      } else {
        // Draw minor tick mark
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 10);
        ctx.strokeStyle = "#444";
        ctx.stroke();
        
        // Draw faint vertical grid line for minor tick
        ctx.beginPath();
        ctx.moveTo(x, 20); // Start below the labels
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(68, 68, 68, 0.2)"; // Very faint minor grid lines
        ctx.stroke();
      }
    }
    
    // Draw horizontal divider line
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(width, 20);
    ctx.strokeStyle = "#666";
    ctx.stroke();
    
    if (this.audioBuffer) {
        const audioStart = this.audioStartTime; // Audio starts at the specified time (not always 0)
        const audioEnd = this.audioStartTime + this.audioBuffer.duration;
        
        // Check if audio start is visible in current view
        if (audioStart >= start && audioStart <= end) {
            const audioStartX = ((audioStart - start) / duration) * width;
            this.drawAudioBoundaryMarker(ctx, audioStartX, height, "Start");
        }
        
        // Check if audio end is visible in current view
        if (audioEnd >= start && audioEnd <= end) {
            const audioEndX = ((audioEnd - start) / duration) * width;
            this.drawAudioBoundaryMarker(ctx, audioEndX, height, "End");
        }
    }
  }
  
  /**
   * Draw a marker for audio boundaries in the timeline
   */
  private drawAudioBoundaryMarker(ctx: CanvasRenderingContext2D, x: number, height: number, label: string): void {
    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    
    // Add label
    ctx.font = "10px Arial";
    ctx.fillStyle = "#f88";
    ctx.textAlign = "center";
    ctx.fillText(`Audio ${label}`, x, height - 5);
  }

  /**
   * Display the current zoom level indicator
   */
  private displayZoomLevelInfo(zoomDisplay: HTMLElement, calculatedZoom: number, visualZoom: number): void {
    if (calculatedZoom === visualZoom) {
      // If at a milestone, display just the zoom
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x`;
    } else {
      // Otherwise show that we're using a pre-calculated value visually scaled
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x`;
    }
  }

  // Update setAudioBuffer to center the audio start time in the view
  public setAudioBuffer(buffer: AudioBuffer, startTimeSeconds: number): void {
      this.audioBuffer = buffer;
      this.audioStartTime = startTimeSeconds;
      
      // Reset waveform drawer to ensure recalculation with new audio
      this.currentWaveformDrawer = null;
      this.lastCalculatedZoom = 1;
      
      // Calculate appropriate visible duration
      const visibleDuration = this.visibleEnd - this.visibleStart;
      
      // Calculate new start - position buffer start time in the middle of the screen
      // by offsetting half the visible duration to the left
      const newStart = Math.max(0, startTimeSeconds - (visibleDuration / 2));
      const newEnd = newStart + visibleDuration;
      
      // Use the same updateUI function that's used for scrollbar updates
      // This will trigger the proper view refresh
      const updateUI = (start: number, end: number) => {
        this.refreshView(start, end);
      };
      
      // Update UI with new range centered on audio start
      updateUI(newStart, newEnd);
      
      // Update the scrollbar to reflect new position
      const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
      if (scrollBar) {
        scrollBar.value = newStart.toString();
      }

      this.clearSelection();
  }

  // Refresh view to update waveform display
  private refreshView(start: number, end: number): void {
    console.log("refresh view start: ", start, " end: ", end);
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    
    // Clear the main waveform canvas
    const ctx = this.waveformCanvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    
    // Draw audio waveform if available and overlapping with visible range
    if (this.audioBuffer) {
      const audioDuration = this.audioBuffer.duration;
      const audioStart = this.audioStartTime; // Use the stored start time
      const audioEnd = audioStart + audioDuration;
      
      // Check if there's overlap between visible range and audio content
      if (start < audioEnd && end > audioStart) {
        // Calculate the portion of audio that should be visible
        const visibleAudioStart = Math.max(start, audioStart);
        const visibleAudioEnd = Math.min(end, audioEnd);
        
        // Determine if we need to recalculate the peaks based on zoom milestone
        const calculatedZoomLevel = this.getNearestLowerMilestone(this.currentZoom);
        
        // Determine if we need to recalculate the waveform
        const needsRecalculation = 
          !this.currentWaveformDrawer || // First render
          calculatedZoomLevel !== this.lastCalculatedZoom || // Zoom milestone changed
          this.visibleStart !== start || // Visible range changed
          this.visibleEnd !== end; // Visible range changed
          
        if (needsRecalculation) {
          // Store that we've calculated for this zoom level
          this.lastCalculatedZoom = calculatedZoomLevel;
          
          // Create a new drawer for this zoom level
          this.currentWaveformDrawer = new WaveformDrawer();
          
          // Adjust the audio offset to account for the start time
          const audioOffsetSec = visibleAudioStart - audioStart;
          const audioDurationSec = visibleAudioEnd - visibleAudioStart;
          
          // Initialize waveform drawer with the overlapping section and the calculated zoom level
          this.currentWaveformDrawer.init(
            this.audioBuffer, 
            this.waveformCanvas, 
            DEFAULT_PRECISION, 
            audioOffsetSec, // Start position within buffer (relative to buffer start)
            audioOffsetSec + audioDurationSec, // End position within buffer
            calculatedZoomLevel
          );
        }
        
        // Calculate what percentage of the view should be occupied by the audio
        // and where it should be positioned
        const startOffset = (visibleAudioStart - start) / (end - start) * this.waveformCanvas.width;
        const visibleWidth = (visibleAudioEnd - visibleAudioStart) / (end - start) * this.waveformCanvas.width;
        
        // Draw the wave at the correct position with the correct width
        if (this.currentWaveformDrawer) {
          this.currentWaveformDrawer.drawWave(startOffset, visibleWidth, this.currentZoom);
          
          // Update display to indicate if we're using a calculated or visual zoom
          this.displayZoomLevelInfo(zoomValue, this.lastCalculatedZoom, this.currentZoom);
        }
      }
    }
    
    // Update timeline
    this.drawTimeline(start, end);
    
    // Update visible range tracking
    this.visibleStart = start;
    this.visibleEnd = end;

    // Update playhead position if needed
    this.updatePlayhead(this.playheadPosition * 1000);

    // Restore selection display after view change
    this.restoreSelectionAfterViewChange();

    // Update zoom input to reflect current zoom
    zoomInput.value = this.currentZoom.toFixed(1);
    
    // Always update scrollbar range based on visible duration
    const visibleDuration = end - start;
    const maxScroll = this.canvasDuration - visibleDuration;
    
    // Enable scrolling even at zoom=1 if we're not viewing the entire canvas
    scrollBar.min = "0";
    scrollBar.max = maxScroll > 0 ? maxScroll.toFixed(2) : "0";
    scrollBar.value = start.toFixed(2);
    scrollBar.disabled = maxScroll <= 0;
  }
  

  // -------------------------------
  // Playhead management
  // -------------------------------

  /**
 * Update the playhead position based on the application playhead time
 * @param appPlayheadTimeMs Application playhead time in milliseconds
 * @param isPlayback Whether this update is from active playback
 */
public updatePlayhead(appPlayheadTimeMs: number, isPlayback: boolean = false): void {
  if (this.isDraggingPlayhead) return;
  
  // Store position in seconds
  this.playheadPosition = appPlayheadTimeMs / 1000;
  
  // Check if playhead time is within our visible range
  if (this.playheadPosition >= this.visibleStart && this.playheadPosition <= this.visibleEnd) {
    // Calculate position within the viewport
    const positionRatio = (this.playheadPosition - this.visibleStart) / (this.visibleEnd - this.visibleStart);
    const pixelPosition = positionRatio * this.waveformCanvas.width;
    
    // Update playhead position - remove transition during playback for smoother updates
    this.playheadElement.style.transition = isPlayback ? 'none' : 'left 0.05s linear';
    this.playheadElement.style.left = `${pixelPosition}px`;
    this.playheadElement.style.display = 'block';
    
    // Get scrollbar for viewport control
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    if (scrollBar && isPlayback) {
      const visibleDuration = this.visibleEnd - this.visibleStart;
      let newStart = this.visibleStart;
      
      if (this.usePageBasedScrolling) {
        // PAGE-BASED SCROLLING BEHAVIOR
        // Check if playhead is near the edge of the viewport (>90%)
        const edgeThreshold = this.waveformCanvas.width * 0.9;
        
        if (pixelPosition > edgeThreshold) {
          // Jump forward by one page (current visible duration)
          newStart = Math.min(
            this.visibleStart + visibleDuration * 0.9, // Overlap by 10%
            this.canvasDuration - visibleDuration // Don't scroll past the end
          );
          
          // Update scrollbar and view if we need to move
          if (newStart > this.visibleStart) {
            scrollBar.value = newStart.toFixed(2);
            this.refreshView(newStart, newStart + visibleDuration);
          }
        }
      } else {
        // DYNAMIC CENTER-ALIGNED SCROLLING BEHAVIOR
        // Check if playhead passes the center of the viewport
        const centerThreshold = this.waveformCanvas.width * 0.5;
        
        if (pixelPosition > centerThreshold) {
          // Calculate how far past the center we are as a percentage
          const pastCenter = pixelPosition - centerThreshold;
          const pastCenterRatio = pastCenter / centerThreshold;
          
          // Calculate new starting position based on how far we've exceeded the center
          // This creates a smooth scroll that keeps the playhead near the center
          const movementAmount = pastCenterRatio * (this.playheadPosition - this.visibleStart) * 0.1;
          
          // Ensure we don't scroll past the available canvas
          newStart = Math.min(
            this.visibleStart + movementAmount,
            this.canvasDuration - visibleDuration
          );
          
          // Only update if we need to scroll
          if (newStart > this.visibleStart) {
            scrollBar.value = newStart.toFixed(2);
            this.refreshView(newStart, newStart + visibleDuration);
          }
        }
      }
    }
  } else {
    // Hide playhead if not in visible range
    this.playheadElement.style.display = 'none';
  }
}

  /**
   * Check if the application playhead time is within the visible audio range
   * @param appPlayheadTimeMs Application playhead time in milliseconds
   * @returns Boolean indicating if playhead is in visible range
   */
  public isPlayheadInVisibleRange(appPlayheadTimeMs: number): boolean {
    const playheadSec = appPlayheadTimeMs / 1000;
    return playheadSec >= this.visibleStart && playheadSec <= this.visibleEnd;
  }
}

customElements.define("audio-editor-element", AudioEditorElement)

export class WaveformDrawer {
  private decodedAudioBuffer: AudioBuffer | null = null;
  private peaks: Float32Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sampleStep: number = DEFAULT_PRECISION;
  // Track the actual zoom level used for peak calculation
  private calculatedZoomLevel: number = 1; 

  init(
    decodedAudioBuffer: AudioBuffer,
    canvas: HTMLCanvasElement,
    sampleStep: number = DEFAULT_PRECISION,
    startSec: number = 0,
    endSec: number | null = null,
    zoomLevel: number = 1
  ): void {
    this.decodedAudioBuffer = decodedAudioBuffer;
    this.canvas = canvas;
    this.sampleStep = sampleStep;
    // Store the zoom level we're calculating for
    this.calculatedZoomLevel = zoomLevel;
    this.getPeaks(startSec, endSec);
  }

  // Add getter for calculatedZoomLevel
  getCalculatedZoomLevel(): number {
    return this.calculatedZoomLevel;
  }

  private getPeaks(startSec: number = 0, endSec: number | null = null): void {
    if (!this.decodedAudioBuffer || !this.canvas) return;

    const buffer = this.decodedAudioBuffer;
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(startSec * sampleRate);
    const endSample = endSec ? Math.floor(endSec * sampleRate) : buffer.length;
    const width = this.canvas.width;
    const sampleSize = Math.ceil((endSample - startSample) / width);

    this.peaks = new Float32Array(width);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < width; i++) {
        const start = startSample + i * sampleSize;
        const end = Math.min(start + sampleSize, endSample);
        let peak = 0;
        for (let j = start; j < end; j += this.sampleStep) {
          const value = channel[j];
          const abs = Math.abs(value);
          if (abs > peak) peak = abs;
        }
        if (c === 0) {
          this.peaks[i] = peak;
        } else {
          this.peaks[i] = (this.peaks[i] + peak) / 2;
        }
      }
    }
  }

  drawWave(startX: number = 0, width: number = 0, visualZoom: number = 1): void {
    if (!this.canvas || !this.peaks) return;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = this.canvas.width;
    const height = this.canvas.height;
    const halfH = height / 2;
    const coef = halfH;

    // Clear the entire canvas if no specific width is provided
    if (width <= 0) {
      ctx.clearRect(0, 0, canvasWidth, height);
      width = canvasWidth;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#00ffff");
    grad.addColorStop(0.5, "#4CAF50");
    grad.addColorStop(1, "#ff00ff");

    ctx.fillStyle = grad;
    ctx.beginPath();
    
    // Use the provided width or default to full canvas width
    const drawWidth = width > 0 ? Math.min(width, canvasWidth - startX) : canvasWidth;
    
    // Start at the specified X position
    ctx.moveTo(startX, halfH);
    
    // Calculate zoom ratio for visual scaling (relationship between visual zoom and calculated zoom)
    const zoomRatio = visualZoom / this.calculatedZoomLevel;
    
    // For audio boundaries, we need to use the actual peaks array length
    // rather than trying to center it when we're at the edge
    const totalPeaks = this.peaks.length;
    
    // Draw top curve with improved boundary handling
    for (let i = 0; i < drawWidth; i++) {
      // Calculate peak index directly proportional to position
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH - val);
      } else {
        // Use center line if out of bounds
        ctx.lineTo(startX + i, halfH);
      }
    }
    
    // Draw bottom curve (in reverse) with improved boundary handling
    for (let i = drawWidth - 1; i >= 0; i--) {
      // Calculate peak index directly proportional to position
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH + val);
      } else {
        // Use center line if out of bounds
        ctx.lineTo(startX + i, halfH);
      }
    }
    
    ctx.closePath();
    ctx.globalAlpha = 0.4;
    ctx.fill();

    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Draw vertical lines with improved boundary handling
    for (let i = 0; i < drawWidth; i++) {
      // Only draw every few lines at higher zoom for better performance
      if (visualZoom > 5 && i % 2 !== 0) continue;
      
      // Calculate peak index directly proportional to position
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.moveTo(startX + i, halfH - val);
        ctx.lineTo(startX + i, halfH + val);
      }
    }
    
    ctx.stroke();
  }
  
}