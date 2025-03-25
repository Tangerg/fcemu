export class Image {
    private readonly width: number
    private readonly height: number
    private readonly points: number[][];

    constructor(width: number, height: number) {
        if (width <= 0 || height <= 0) {
            throw new Error("width and height must be greater than 0");
        }
        this.width = width;
        this.height = height;
        this.points = new Array(width).fill(0).map(() => new Array(height).fill(0));
    }

    private check(x: number, y: number) {
        if (x < 0 || x >= this.width) {
            throw new Error(`x must be gte 0 and be lt ${this.width}`);
        }
        if (y < 0 || y >= this.height) {
            throw new Error(`y must be gte 0 and be lt ${this.height}`);
        }
    }

    public setRGBA(x: number, y: number, rgba: number) {
        this.check(x, y);
        this.points[x][y] = rgba;
    }

    public value() {
        let rv: number = 0;
        this.points.forEach(item => {
            item.forEach((v: number) => {
                rv += v
            })
        })
        return rv;
    }
}