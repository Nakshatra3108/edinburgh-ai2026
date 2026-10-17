import {describe,it,expect} from 'vitest';
import{drawingBounds,findFigureRegions,transformRect}from'./figureGeometry';
import{OPS}from'pdfjs-dist/legacy/build/pdf.mjs';
describe('local PDF figure geometry',()=>{
 it('tracks nested forms, graphics save/restore, rotation and repeated images',()=>{
  const bounds=drawingBounds({fnArray:[OPS.save,OPS.transform,OPS.paintFormXObjectBegin,OPS.paintImageXObject,OPS.paintFormXObjectEnd,OPS.restore,OPS.paintImageXObjectRepeat],argsArray:[[],[200,0,0,100,20,30],[[1,0,0,1,2,3],null],['image'],[],[],['repeat',80,60,[300,400,420,400]]]},OPS,[1,0,0,-1,0,800]);
  expect(bounds.images).toEqual([{x:420,y:370,width:200,height:100},{x:300,y:340,width:80,height:60},{x:420,y:340,width:80,height:60}]);
  expect(transformRect({x:10,y:20,width:100,height:50},[0,1,-1,0,800,0])).toEqual({x:730,y:10,width:50,height:100});
 });
 it('excludes small logos and keeps a captioned raster crop',()=>{
  const result=findFigureRegions([{x:550,y:20,width:16,height:16},{x:50,y:220,width:500,height:280}],[],[{x:50,y:520,width:320,height:12,text:'Figure 1. Reactor pressure before and after cooling.'}],612,792);
  expect(result).toHaveLength(1);expect(result[0].kind).toBe('image');expect(result[0].caption).toContain('Reactor pressure');
  expect(result[0].rect.width).toBe(516);
 });
 it('captures captioned vector paths but not uncaptioned decorative rules',()=>{
  const paths=[{x:50,y:250,width:150,height:90},{x:201,y:290,width:25,height:1},{x:228,y:250,width:150,height:90}];
  expect(findFigureRegions([],paths,[],612,792)).toEqual([]);
  const result=findFigureRegions([],paths,[{x:50,y:370,width:420,height:12,text:'Figure 2. Water circulation through capture and return.'}],612,792);
  expect(result).toHaveLength(1);expect(result[0].kind).toBe('page-crop');expect(result[0].rect.width).toBeGreaterThan(328);
 });
});
