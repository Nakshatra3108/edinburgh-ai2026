import {expect,it} from 'vitest';
import {metricDisplay} from './metric';
it('keeps a quoted percentage intact without duplicating its unit',()=>{
 expect(metricDisplay('75.8%','%')).toEqual({value:'75.8%',unit:null});
 expect(metricDisplay('75.8%','percent').unit).toBeNull();
 expect(metricDisplay('75.8','%')).toEqual({value:'75.8',unit:'%'});
});
it('does not duplicate units already present in a metric value',()=>{
 expect(metricDisplay('10 ms','ms').unit).toBeNull();
 expect(metricDisplay('£500','£').unit).toBeNull();
 expect(metricDisplay('150','ms').unit).toBe('ms');
 expect(metricDisplay('25',null).unit).toBeNull();
});
