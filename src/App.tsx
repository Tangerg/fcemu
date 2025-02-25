import './App.css'
import * as React from "react";
import Cartridge from "./core/cartridge.ts";

const FileLoader: React.FC = () => {
    const handleFileChange = async (event: any) => {
        const file: File = event.target.files[0];
        console.log(file);
        if (!file) return;
        const cart = await Cartridge.load(file);
        console.log(cart);
    };

    return (
        <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-4">本地文件读取器</h2>

            <div className="mb-4">
                <label className="block text-gray-700 mb-2">选择文件:</label>
                <input
                    type="file"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
                />
            </div>
        </div>
    );
}

function App() {

    return (
        <FileLoader/>
    )
}

export default App
