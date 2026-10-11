
export interface EventOptions {
    name: string;
    type?: 'client' | 'player' | 'node' | 'voice';
    once?: boolean;
}

export class Event {
    public name: string;
    public type: 'client' | 'player' | 'node' | 'voice';
    public once: boolean;

    constructor(options: EventOptions = {} as EventOptions) {
        this.name = options.name;
        this.type = options.type || 'client';
        this.once = options.once || false;
    }

    async execute(): Promise<any> {
        throw new Error(`Event ${this.name} doesn't provide an execute method!`);
    }
}

// Made by Nikhil Under CodeX Devs
