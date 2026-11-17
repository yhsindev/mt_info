import {describe,expect,it} from 'vitest';
import {BINGO_PROMPTS,bingoLines,newBingoBoard,readBingoBoard,saveBingoBoard,toggleBingoMark} from '../src/cards/bingo';

describe('山路觀察賓果', () => {
  it('每局從已知題庫取九張不同格子，並能判斷連線', () => {
    const board = newBingoBoard(() => 0.4);
    expect(board.ids).toHaveLength(9);
    expect(new Set(board.ids).size).toBe(9);
    expect(board.ids.every(id => BINGO_PROMPTS.some(prompt => prompt.id === id))).toBe(true);
    const completed = board.ids.slice(0,3).reduce(toggleBingoMark,board);
    expect(bingoLines(completed)).toContainEqual([0,1,2]);
    expect(bingoLines(toggleBingoMark(completed,board.ids[1]))).not.toContainEqual([0,1,2]);
  });

  it('重開後只還原合法格子與點選，不接受竄改題庫', () => {
    let raw: string|null = null;
    const storage = {getItem:() => raw,setItem:(_key:string,value:string) => {raw = value;}};
    const board = newBingoBoard(() => 0.3);
    expect(saveBingoBoard(toggleBingoMark(board,board.ids[0]),storage)).toBe(true);
    expect(readBingoBoard(storage)?.marked).toEqual([board.ids[0]]);
    raw = JSON.stringify({...board,ids:[...board.ids.slice(0,8),'invented']});
    expect(readBingoBoard(storage)).toBeNull();
  });
});
