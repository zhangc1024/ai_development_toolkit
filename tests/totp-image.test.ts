import { it,expect } from 'vitest'
import {parseQrOtp} from '../src/tools/extra/core'
it('QR URI parameters',()=>expect(parseQrOtp('otpauth://totp/demo?secret=MY&algorithm=SHA512&digits=8&period=60')).toEqual({secret:'MY',algorithm:'SHA512',digits:8,period:60,raw:false}))
it('plain key defaults',()=>expect(parseQrOtp(' my====== ')).toEqual({secret:'MY======',algorithm:'SHA1',digits:6,period:30,raw:true}))
for(const text of ['https://example.com','otpauth://hotp/demo?secret=MY','otpauth-migration://offline?data=abc','otpauth://totp/demo?secret=INVALID!','otpauth://totp/demo?secret=MY&digits=7','otpauth://totp/demo?secret=MY&secret=MY','', '<script>'])it('reject '+text,()=>expect(()=>parseQrOtp(text)).toThrow())
