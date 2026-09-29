"""US Standard Atmosphere 1976: density and temperature vs geometric altitude (0-1000 km).
Below 86 km: layer equations (geopotential altitude). Above: log-linear interpolation of the US76 tables."""
import numpy as np
R0, G0, MOL, RSTAR = 6356.766, 9.80665, 0.0289644, 8.31432
_HB = np.array([0.0, 11.0, 20.0, 32.0, 47.0, 51.0, 71.0, 84.8520])            # geopotential km
_TB = np.array([288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946])
_LB = np.array([-6.5, 0.0, 1.0, 2.8, 0.0, -2.8, -2.0, 0.0])                     # K/km
_PB = np.array([101325.0, 22632.06, 5474.889, 868.0187, 110.9063, 66.93887, 3.956420, 0.3733836])
# US76 high-altitude table: geometric km, density kg/m^3, kinetic temperature K
_HI = np.array([86, 90, 95, 100, 105, 110, 115, 120, 130, 140, 150, 160, 180, 200, 250, 300, 350, 400, 500, 700, 1000], float)
_RHO = np.array([6.958e-6, 3.416e-6, 1.393e-6, 5.604e-7, 2.325e-7, 9.708e-8, 4.289e-8, 2.222e-8, 8.152e-9, 3.831e-9,
                 2.076e-9, 1.233e-9, 5.194e-10, 2.541e-10, 6.073e-11, 1.916e-11, 7.014e-12, 2.803e-12, 5.215e-13, 3.070e-14, 3.561e-15])
_THI = np.array([186.87, 186.87, 188.42, 195.08, 208.84, 240.0, 300.0, 360.0, 469.27, 559.63, 634.39, 696.29, 790.07,
                 854.56, 941.33, 976.01, 990.06, 995.83, 999.24, 999.99, 1000.0])
def atmo(h_km):
    """(density kg/m^3, temperature K, speed of sound m/s) at geometric altitude h_km (scalar)"""
    h = max(h_km, -1.0)
    if h < 86.0:
        H = R0*h/(R0 + h)
        i = min(np.searchsorted(_HB, H, side='right') - 1, 7); i = max(i, 0)
        Tb, Lb, Pb, dH = _TB[i], _LB[i], _PB[i], H - _HB[i]
        if Lb == 0.0: T = Tb; P = Pb*np.exp(-G0*MOL*dH*1000/(RSTAR*Tb))
        else: T = Tb + Lb*dH; P = Pb*(Tb/T)**(G0*MOL/(RSTAR*Lb/1000))
        rho = P*MOL/(RSTAR*T)
    else:
        hh = min(h, 1000.0)
        rho = float(np.exp(np.interp(hh, _HI, np.log(_RHO)))); T = float(np.interp(hh, _HI, _THI))
    return rho, T, np.sqrt(1.4*287.053*min(T, 400.0))
if __name__ == '__main__':
    ref = {0: 1.2250, 10: 0.41351, 20: 0.088910, 30: 0.018410, 40: 3.9957e-3, 50: 1.0269e-3, 60: 3.0968e-4, 70: 8.2829e-5, 80: 1.8458e-5, 85.9: 7.0e-6}
    for h, r in ref.items():
        rho, T, a = atmo(h); print(f'{h:5.1f} km  rho {rho:.5e}  US76 {r:.5e}  ratio {rho/r:.4f}  T {T:7.2f} K  a {a:6.1f} m/s')
    print('86.0 km (table side)', atmo(86.0)[0], ' 85.99 km (layer side)', atmo(85.99)[0])
