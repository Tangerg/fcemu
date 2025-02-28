/**
 * Class representing NES controller buttons state
 */
class Buttons {
    public A: boolean = false        // A button  
    public B: boolean = false        // B button   
    public Select: boolean = false   // Select button  
    public Start: boolean = false    // Start button  
    public Up: boolean = false       // D-pad Up  
    public Down: boolean = false     // D-pad Down   
    public Left: boolean = false     // D-pad Left  
    public Right: boolean = false    // D-pad Right  

    /**
     * Set button states from boolean array
     * @param state Array of 8 booleans representing button states
     */
    set state(state: boolean[]) {
        this.A = state[0] || false;
        this.B = state[1] || false;
        this.Select = state[2] || false;
        this.Start = state[3] || false;
        this.Up = state[4] || false;
        this.Down = state[5] || false;
        this.Left = state[6] || false;
        this.Right = state[7] || false;
    }

    /**
     * Get button states as boolean array
     * @returns Array of 8 booleans representing button states
     */
    get state(): boolean[] {
        return [
            this.A,
            this.B,
            this.Select,
            this.Start,
            this.Up,
            this.Down,
            this.Left,
            this.Right
        ];
    }
}

/**
 * Class implementing NES controller functionality
 * Simulates the shift register behavior of real NES controller
 */
class Controller {
    private readonly buttons: Buttons        // Button states  
    private currentButtonIndex: number       // Current button being read  
    private strobeSignal: boolean            // Strobe signal state

    constructor() {
        this.buttons = new Buttons()
        this.currentButtonIndex = 0
        this.strobeSignal = false
    }

    /**
     * Set strobe signal
     * When strobe is high (1), button reading resets to first button
     * @param value Strobe signal value
     */
    set strobe(value: number) {
        this.strobeSignal = Boolean(value & 1)
        if (this.strobeSignal) {
            this.currentButtonIndex = 0
        }
    }

    /**
     * Set all button states at once
     * @param state Array of button states
     */
    set buttonsState(state: boolean[]) {
        this.buttons.state = state
    }

    /**
     * Read current button state and advance to next button
     * Simulates shift register behavior of real NES controller
     * @returns Current button state (0 or 1)
     */
    get currentButton(): number {
        let button: number = 0
        const buttons = this.buttons.state
        if (this.currentButtonIndex < 8) {
            button = Number(buttons[this.currentButtonIndex])
        }
        this.currentButtonIndex++
        if (this.strobeSignal) {
            this.currentButtonIndex = 0
        }
        return button
    }

    // Button press/release methods  
    public aPress() {
        this.buttons.A = true
    }

    public aRelease() {
        this.buttons.A = false
    }

    public bPress() {
        this.buttons.B = true
    }

    public bRelease() {
        this.buttons.B = false
    }

    public selectPress() {
        this.buttons.Select = true
    }

    public selectRelease() {
        this.buttons.Select = false
    }

    public startPress() {
        this.buttons.Start = true
    }

    public startRelease() {
        this.buttons.Start = false
    }

    public upPress() {
        this.buttons.Up = true
    }

    public upRelease() {
        this.buttons.Up = false
    }

    public downPress() {
        this.buttons.Down = true
    }

    public downRelease() {
        this.buttons.Down = false
    }

    public leftPress() {
        this.buttons.Left = true
    }

    public leftRelease() {
        this.buttons.Left = false
    }

    public rightPress() {
        this.buttons.Right = true
    }

    public rightRelease() {
        this.buttons.Right = false
    }
}

export default Controller  