import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputclaimComponent } from './inputclaim.component';

describe('InputclaimComponent', () => {
  let component: InputclaimComponent;
  let fixture: ComponentFixture<InputclaimComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputclaimComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InputclaimComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
